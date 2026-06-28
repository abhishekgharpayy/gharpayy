import { MongoClient } from "mongodb";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";

config({ path: path.join(process.cwd(), "server", ".env") });

async function generateReport() {
  const MONGO_URL = process.env.MONGO_URL!;
  const DB_NAME = process.env.MONGO_DB || "ops";

  console.log("Connecting to MongoDB...");
  const client = new MongoClient(MONGO_URL);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    console.log("Fetching data...");
    const followUps = await db.collection("followUps").find().toArray();
    
    const leadIds = [...new Set(followUps.map(f => f.leadId).filter(Boolean))];
    const tcmIds = [...new Set(followUps.map(f => f.tcmId).filter(Boolean))];

    const leads = await db.collection("leads").find({ id: { $in: leadIds } }).toArray();
    const tcms = await db.collection("users").find({ id: { $in: tcmIds } }).toArray();

    const leadsMap = new Map(leads.map(l => [l.id, l]));
    const tcmsMap = new Map(tcms.map(t => [t.id, t]));

    console.log(`Processing ${followUps.length} tasks...`);
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;

    let totalAvgTime = 0;
    let completedWithTime = 0;

    const tcmStats = new Map<string, any>();
    const typeStats = new Map<string, any>();
    const dailyStats = new Map<string, any>();

    let oldestOverdue = { age: -1, name: "", days: 0 };
    const overdueByTcm = new Map<string, number>();
    const overdueByType = new Map<string, number>();

    const auditData = [];
    
    // Initialize 30 days
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now - i * 86400000);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        dailyStats.set(dateStr, { date: dateStr, created: 0, completed: 0 });
    }

    const reportData = {
      kpi: { total: followUps.length, completed: 0, pending: 0, overdue: 0, completionRate: 0, avgTime: 0 },
      tcms: [] as any[],
      types: [] as any[],
      daily: [] as any[],
      audit: [] as any[],
      overdueAnalysis: { total: 0, mostOverdueTcm: "", mostOverdueType: "", oldestTask: "" }
    };

    // Sort followups by dueAt descending for the audit table
    followUps.sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : new Date(a.dueAt || 0).getTime();
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : new Date(b.dueAt || 0).getTime();
        return tb - ta;
    });

    for (const f of followUps) {
        const tcmId = f.tcmId || "unassigned";
        const type = f.reason || "unknown";
        const dueAt = new Date(f.dueAt).getTime();
        const createdAt = f.createdAt ? new Date(f.createdAt).getTime() : (dueAt - 86400000); // fallback 1 day before due
        const updatedAt = f.updatedAt ? new Date(f.updatedAt).getTime() : now;

        const isOverdue = !f.done && dueAt < now;
        const isPending = !f.done && dueAt >= now;

        // KPI
        if (f.done) reportData.kpi.completed++;
        else if (isOverdue) reportData.kpi.overdue++;
        else reportData.kpi.pending++;

        // TCM Stats
        if (!tcmStats.has(tcmId)) {
            tcmStats.set(tcmId, { id: tcmId, name: tcmsMap.get(tcmId)?.name || tcmId, total: 0, completed: 0, pending: 0, overdue: 0, recent7: 0, timeSum: 0, timeCount: 0 });
        }
        const ts = tcmStats.get(tcmId);
        ts.total++;
        if (f.done) {
            ts.completed++;
            if (updatedAt > sevenDaysAgo) ts.recent7++;
            const hours = (updatedAt - createdAt) / 3600000;
            if (hours >= 0 && hours < 8760) { // sanity check < 1 year
                ts.timeSum += hours;
                ts.timeCount++;
                totalAvgTime += hours;
                completedWithTime++;
            }
        } else if (isOverdue) {
            ts.overdue++;
            overdueByTcm.set(tcmId, (overdueByTcm.get(tcmId) || 0) + 1);
            
            const daysOverdue = (now - dueAt) / 86400000;
            if (daysOverdue > oldestOverdue.age) {
                const leadName = leadsMap.get(f.leadId)?.name || "Unknown";
                oldestOverdue = { age: daysOverdue, name: `Task for ${leadName} (${type})`, days: Math.round(daysOverdue) };
            }
        } else {
            ts.pending++;
        }

        // Type Stats
        if (!typeStats.has(type)) {
            typeStats.set(type, { type: type.replace(/_/g, " "), total: 0, completed: 0, pending: 0, overdue: 0 });
        }
        const tys = typeStats.get(type);
        tys.total++;
        if (f.done) tys.completed++;
        else if (isOverdue) {
            tys.overdue++;
            overdueByType.set(type, (overdueByType.get(type) || 0) + 1);
        }
        else tys.pending++;

        // Daily Stats
        if (createdAt > thirtyDaysAgo) {
            const cd = new Date(createdAt);
            const createdDateStr = `${cd.getFullYear()}-${String(cd.getMonth()+1).padStart(2,'0')}-${String(cd.getDate()).padStart(2,'0')}`;
            if (dailyStats.has(createdDateStr)) dailyStats.get(createdDateStr).created++;
        }
        if (f.done && updatedAt > thirtyDaysAgo) {
            const ud = new Date(updatedAt);
            const updatedDateStr = `${ud.getFullYear()}-${String(ud.getMonth()+1).padStart(2,'0')}-${String(ud.getDate()).padStart(2,'0')}`;
            if (dailyStats.has(updatedDateStr)) dailyStats.get(updatedDateStr).completed++;
        }

        // Audit Table (only top 50)
        if (auditData.length < 50) {
            const leadName = leadsMap.get(f.leadId)?.name || "Unknown Lead";
            const tcmName = tcmsMap.get(f.tcmId)?.name || "Unassigned";
            const timestamp = (f.updatedAt || f.createdAt || f.dueAt);
            let statusObj = { text: " Pending", val: "pending", days: 0 };
            if (f.done) statusObj = { text: " Completed", val: "completed", days: 0 };
            else if (isOverdue) {
                const odDays = Math.round((now - dueAt) / 86400000);
                statusObj = { text: ` Overdue (${odDays}d)`, val: "overdue", days: odDays };
            }

            auditData.push({
                timeStr: new Date(timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
                tcm: tcmName,
                leadName: leadName,
                type: type.replace(/_/g, " "),
                status: statusObj.text,
                statusVal: statusObj.val
            });
        }
    }

    reportData.kpi.completionRate = reportData.kpi.total > 0 ? Math.round((reportData.kpi.completed / reportData.kpi.total) * 100) : 0;
    reportData.kpi.avgTime = completedWithTime > 0 ? Math.round(totalAvgTime / completedWithTime) : 0;
    
    // Finalize TCMs
    for (const ts of tcmStats.values()) {
        ts.completionRate = ts.total > 0 ? Math.round((ts.completed / ts.total) * 100) : 0;
        ts.avgTime = ts.timeCount > 0 ? Math.round(ts.timeSum / ts.timeCount) : 0;
        ts.score = (ts.completionRate * 0.5) + (ts.recent7 * 0.3) - (ts.overdue * 0.2);
        reportData.tcms.push(ts);
    }
    reportData.tcms.sort((a, b) => b.score - a.score);

    // Finalize Types
    for (const tys of typeStats.values()) {
        tys.completionRate = tys.total > 0 ? Math.round((tys.completed / tys.total) * 100) : 0;
        reportData.types.push(tys);
    }
    reportData.types.sort((a, b) => b.total - a.total);

    reportData.daily = Array.from(dailyStats.values());
    reportData.audit = auditData;

    // Overdue Analysis
    let topOverdueTcm = { name: "None", count: 0 };
    for (const [tcmId, count] of overdueByTcm.entries()) {
        if (count > topOverdueTcm.count) topOverdueTcm = { name: tcmsMap.get(tcmId)?.name || tcmId, count };
    }
    let topOverdueType = { type: "None", count: 0 };
    for (const [type, count] of overdueByType.entries()) {
        if (count > topOverdueType.count) topOverdueType = { type, count };
    }

    reportData.overdueAnalysis = {
        total: reportData.kpi.overdue,
        mostOverdueTcm: topOverdueTcm.name,
        mostOverdueType: topOverdueType.type.replace(/_/g, " "),
        oldestTask: oldestOverdue.name ? `${oldestOverdue.name} (${oldestOverdue.days} days)` : "None"
    };

    console.log("Generating HTML...");

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Impact Queue Audit Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg: #0f172a;
            --card: #1e293b;
            --border: #334155;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --primary: #3b82f6;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
        }
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body { background-color: var(--bg); color: var(--text); margin: 0; padding: 0; line-height: 1.5; }
        
        .nav { position: sticky; top: 0; background: rgba(30, 41, 59, 0.9); backdrop-filter: blur(8px); padding: 1rem 2rem; border-bottom: 1px solid var(--border); z-index: 100; display: flex; justify-content: space-between; align-items: center; }
        .nav h1 { margin: 0; font-size: 1.25rem; font-weight: 600; }
        .nav-links a { color: var(--text-muted); text-decoration: none; margin-left: 1.5rem; font-size: 0.875rem; transition: color 0.2s; }
        .nav-links a:hover { color: var(--text); }
        .timestamp { font-size: 0.75rem; color: var(--text-muted); }

        .container { max-w: 1200px; margin: 0 auto; padding: 2rem; }
        
        .grid-kpi { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .kpi-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem; }
        .kpi-value { font-size: 2rem; font-weight: 700; line-height: 1; }
        
        .text-success { color: var(--success); }
        .text-warning { color: var(--warning); }
        .text-danger { color: var(--danger); }

        .section-title { font-size: 1.25rem; font-weight: 600; margin: 2rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
        
        .grid-charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        .chart-card { background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); height: 350px; }
        .chart-card h3 { margin: 0 0 1rem; font-size: 0.875rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .chart-container { position: relative; height: 100%; width: 100%; padding-bottom: 20px;}

        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem; }
        th { padding: 0.75rem 1rem; background: rgba(0,0,0,0.2); color: var(--text-muted); font-weight: 500; cursor: pointer; border-bottom: 1px solid var(--border); }
        th:hover { color: var(--text); }
        td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: rgba(255,255,255,0.02); }
        
        .table-card { background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; overflow: auto; margin-bottom: 2rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        
        .search-bar { width: 100%; padding: 0.75rem 1rem; background: var(--bg); border: none; border-bottom: 1px solid var(--border); color: var(--text); outline: none; }
        .search-bar::placeholder { color: var(--text-muted); }

        .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; background: rgba(255,255,255,0.1); }
        .badge.success { background: rgba(16, 185, 129, 0.2); color: var(--success); }
        .badge.warning { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
        .badge.danger { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
    </style>
</head>
<body>

    <div class="nav">
        <div>
            <h1>Impact Queue Audit Report</h1>
            <div class="timestamp">Generated at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</div>
        </div>
        <div class="nav-links">
            <a href="#summary">Summary</a>
            <a href="#charts">Charts</a>
            <a href="#tables">Data Tables</a>
            <a href="#audit">Audit Log</a>
        </div>
    </div>

    <div class="container">
        
        <!-- KPIs -->
        <div id="summary" class="section-title">Executive Summary</div>
        <div class="grid-kpi">
            <div class="kpi-card">
                <div class="kpi-label">Total Tasks</div>
                <div class="kpi-value">${reportData.kpi.total}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Completed</div>
                <div class="kpi-value text-success">${reportData.kpi.completed}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Pending</div>
                <div class="kpi-value text-warning">${reportData.kpi.pending}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Overdue</div>
                <div class="kpi-value text-danger">${reportData.kpi.overdue}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Completion Rate</div>
                <div class="kpi-value">${reportData.kpi.completionRate}%</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Avg Completion Time</div>
                <div class="kpi-value">${reportData.kpi.avgTime}h</div>
            </div>
        </div>

        <div class="grid-kpi" style="grid-template-columns: 1fr; margin-bottom: 2rem;">
            <div class="kpi-card" style="display: flex; gap: 2rem; align-items: center; justify-content: space-between;">
                <div><div class="kpi-label">Most Overdue TCM</div><div style="font-weight: 600;">${reportData.overdueAnalysis.mostOverdueTcm}</div></div>
                <div><div class="kpi-label">Most Overdue Type</div><div style="font-weight: 600;">${reportData.overdueAnalysis.mostOverdueType}</div></div>
                <div><div class="kpi-label">Oldest Overdue Task</div><div style="font-weight: 600;" class="text-danger">${reportData.overdueAnalysis.oldestTask}</div></div>
            </div>
        </div>

        <!-- Charts -->
        <div id="charts" class="section-title">Visualizations</div>
        <div class="grid-charts">
            <div class="chart-card">
                <h3>Overall Status</h3>
                <div class="chart-container"><canvas id="donutChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h3>Tasks per TCM (Grouped)</h3>
                <div class="chart-container"><canvas id="barTcmChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h3>Task Types (Completed vs Pending)</h3>
                <div class="chart-container"><canvas id="barTypeChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h3>Daily Activity (Last 30 Days)</h3>
                <div class="chart-container"><canvas id="lineDailyChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h3>TCM Leaderboard (Score)</h3>
                <div class="chart-container"><canvas id="hbarLeaderboard"></canvas></div>
            </div>
            <div class="chart-card">
                <h3>Task Type Distribution</h3>
                <div class="chart-container"><canvas id="pieTypeChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h3>Avg Time to Complete (Hours)</h3>
                <div class="chart-container"><canvas id="barTimeChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h3>Per-TCM Breakdown</h3>
                <div class="chart-container"><canvas id="stackedBarChart"></canvas></div>
            </div>
        </div>

        <!-- Tables -->
        <div id="tables" class="section-title">Data Tables</div>
        
        <div class="grid-charts" style="grid-template-columns: 1fr;">
            <div class="table-card">
                <div style="padding: 1rem 1.5rem; font-weight: 600; border-bottom: 1px solid var(--border);">TCM Performance</div>
                <table>
                    <thead><tr><th>Name</th><th>Total</th><th>Completed</th><th>Pending</th><th>Overdue</th><th>Completion %</th><th>Avg Time (h)</th><th>Score</th></tr></thead>
                    <tbody id="tcmTableBody"></tbody>
                </table>
            </div>

            <div class="table-card">
                <div style="padding: 1rem 1.5rem; font-weight: 600; border-bottom: 1px solid var(--border);">Task Type Breakdown</div>
                <table>
                    <thead><tr><th>Type</th><th>Total</th><th>Completed</th><th>Pending</th><th>Overdue</th><th>Completion %</th></tr></thead>
                    <tbody id="typeTableBody"></tbody>
                </table>
            </div>
        </div>

        <!-- Audit Table -->
        <div id="audit" class="section-title">Latest 50 Actions (Audit Log)</div>
        <div class="table-card">
            <input type="text" id="auditSearch" class="search-bar" placeholder="Search audit logs (Name, TCM, Type)...">
            <table id="auditTable">
                <thead><tr>
                    <th data-sort="timeStr">Timestamp </th>
                    <th data-sort="tcm">TCM </th>
                    <th data-sort="leadName">Lead </th>
                    <th data-sort="type">Task Type </th>
                    <th data-sort="statusVal">Status </th>
                </tr></thead>
                <tbody id="auditTableBody"></tbody>
            </table>
        </div>

    </div>

    <script>
        const REPORT_DATA = ${JSON.stringify(reportData)};
        
        // Setup Chart.js defaults
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const colors = {
            success: '#10b981',
            warning: '#f59e0b',
            danger: '#ef4444',
            primary: '#3b82f6',
            accent: '#8b5cf6',
            muted: '#334155'
        };

        const kpi = REPORT_DATA.kpi;
        const tcms = REPORT_DATA.tcms;
        const types = REPORT_DATA.types;
        const daily = REPORT_DATA.daily;

        // 1. Donut Chart
        new Chart(document.getElementById('donutChart'), {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'Pending', 'Overdue'],
                datasets: [{
                    data: [kpi.completed, kpi.pending, kpi.overdue],
                    backgroundColor: [colors.success, colors.warning, colors.danger],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
        });

        // 2. Bar Chart - TCM Grouped
        new Chart(document.getElementById('barTcmChart'), {
            type: 'bar',
            data: {
                labels: tcms.map(t => t.name.split(' ')[0]),
                datasets: [
                    { label: 'Completed', data: tcms.map(t => t.completed), backgroundColor: colors.success },
                    { label: 'Pending', data: tcms.map(t => t.pending), backgroundColor: colors.warning },
                    { label: 'Overdue', data: tcms.map(t => t.overdue), backgroundColor: colors.danger }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false, color: colors.muted } }, y: { grid: { color: colors.muted } } } }
        });

        // 3. Bar Chart - Type Grouped
        new Chart(document.getElementById('barTypeChart'), {
            type: 'bar',
            data: {
                labels: types.map(t => t.type),
                datasets: [
                    { label: 'Completed', data: types.map(t => t.completed), backgroundColor: colors.success },
                    { label: 'Pending / Overdue', data: types.map(t => t.pending + t.overdue), backgroundColor: colors.warning }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { grid: { color: colors.muted } } } }
        });

        // 4. Line Chart - Daily Activity
        new Chart(document.getElementById('lineDailyChart'), {
            type: 'line',
            data: {
                labels: daily.map(d => d.date.slice(5)),
                datasets: [
                    { label: 'Created', data: daily.map(d => d.created), borderColor: colors.primary, tension: 0.3, backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true },
                    { label: 'Completed', data: daily.map(d => d.completed), borderColor: colors.success, tension: 0.3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { grid: { color: colors.muted } } }, elements: { point: { radius: 0 } } }
        });

        // 5. Horizontal Bar - Leaderboard
        new Chart(document.getElementById('hbarLeaderboard'), {
            type: 'bar',
            data: {
                labels: tcms.map(t => t.name),
                datasets: [{ label: 'Score', data: tcms.map(t => t.score), backgroundColor: colors.accent, borderRadius: 4 }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { grid: { color: colors.muted } }, y: { grid: { display: false } } } }
        });

        // 6. Pie Chart - Type Distribution
        new Chart(document.getElementById('pieTypeChart'), {
            type: 'pie',
            data: {
                labels: types.map(t => t.type),
                datasets: [{
                    data: types.map(t => t.total),
                    backgroundColor: [colors.primary, colors.success, colors.warning, colors.danger, colors.accent, '#ec4899', '#14b8a6'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        // 7. Bar Chart - Avg Time
        new Chart(document.getElementById('barTimeChart'), {
            type: 'bar',
            data: {
                labels: tcms.map(t => t.name.split(' ')[0]),
                datasets: [{ label: 'Avg Hours', data: tcms.map(t => t.avgTime), backgroundColor: colors.primary, borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { grid: { color: colors.muted } } } }
        });

        // 8. Stacked Bar Chart
        new Chart(document.getElementById('stackedBarChart'), {
            type: 'bar',
            data: {
                labels: tcms.map(t => t.name.split(' ')[0]),
                datasets: [
                    { label: 'Completed', data: tcms.map(t => t.completed), backgroundColor: colors.success },
                    { label: 'Pending', data: tcms.map(t => t.pending), backgroundColor: colors.warning },
                    { label: 'Overdue', data: tcms.map(t => t.overdue), backgroundColor: colors.danger }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: colors.muted } } } }
        });

        // Populate Tables
        const tcmBody = document.getElementById('tcmTableBody');
        tcms.forEach(t => {
            tcmBody.innerHTML += \`<tr>
                <td>\${t.name}</td><td>\${t.total}</td><td class="text-success">\${t.completed}</td>
                <td class="text-warning">\${t.pending}</td><td class="text-danger">\${t.overdue}</td>
                <td>\${t.completionRate}%</td><td>\${t.avgTime}</td><td><strong>\${t.score.toFixed(1)}</strong></td>
            </tr>\`;
        });

        const typeBody = document.getElementById('typeTableBody');
        types.forEach(t => {
            typeBody.innerHTML += \`<tr>
                <td style="text-transform: capitalize;">\${t.type}</td><td>\${t.total}</td><td class="text-success">\${t.completed}</td>
                <td class="text-warning">\${t.pending}</td><td class="text-danger">\${t.overdue}</td><td>\${t.completionRate}%</td>
            </tr>\`;
        });

        // Audit Table Logic
        let currentAuditData = [...REPORT_DATA.audit];
        const auditBody = document.getElementById('auditTableBody');
        const searchInput = document.getElementById('auditSearch');
        
        function renderAudit() {
            auditBody.innerHTML = '';
            currentAuditData.forEach(row => {
                let badgeClass = 'warning';
                if (row.statusVal === 'completed') badgeClass = 'success';
                if (row.statusVal === 'overdue') badgeClass = 'danger';
                
                auditBody.innerHTML += \`<tr>
                    <td style="white-space: nowrap;">\${row.timeStr}</td>
                    <td>\${row.tcm}</td>
                    <td>\${row.leadName}</td>
                    <td style="text-transform: capitalize;">\${row.type}</td>
                    <td><span class="badge \${badgeClass}">\${row.status}</span></td>
                </tr>\`;
            });
        }
        
        renderAudit();

        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            currentAuditData = REPORT_DATA.audit.filter(r => 
                r.tcm.toLowerCase().includes(q) || 
                r.leadName.toLowerCase().includes(q) || 
                r.type.toLowerCase().includes(q) ||
                r.status.toLowerCase().includes(q)
            );
            renderAudit();
        });

        let sortCol = '';
        let sortAsc = true;
        document.querySelectorAll('#auditTable th').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.sort;
                if (sortCol === col) sortAsc = !sortAsc;
                else { sortCol = col; sortAsc = true; }
                
                currentAuditData.sort((a, b) => {
                    let valA = a[col];
                    let valB = b[col];
                    if (valA < valB) return sortAsc ? -1 : 1;
                    if (valA > valB) return sortAsc ? 1 : -1;
                    return 0;
                });
                renderAudit();
            });
        });

    </script>
</body>
</html>`;

    fs.writeFileSync(path.join(process.cwd(), "impact_queue_report.html"), html);
    console.log("SUCCESS! Report saved to impact_queue_report.html");

  } catch (err) {
    console.error("Error generating report:", err);
  } finally {
    await client.close();
  }
}

generateReport();
