import { col } from "../db/mongo.js";
import { createAlert } from "../modules/alerts/routes.js";

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startAlertGenerator() {
  if (intervalHandle) return;
  console.log("[alerts] alert generator started (interval: 5 min)");
  intervalHandle = setInterval(generateAlerts, 5 * 60 * 1000);
  generateAlerts();
}

export function stopAlertGenerator() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

async function generateAlerts() {
  try {
    await checkOverdueRents();
    await checkPendingBookings();
    await checkExitedTenants();
  } catch (err) {
    console.error("[alerts] generation error:", err);
  }
}

async function checkOverdueRents() {
  const now = new Date().toISOString();
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const overduePayments = await col("payments")
    .find({
      month: currentMonth,
      status: { $in: ["pending", "overdue"] },
      type: "rent",
    })
    .toArray();

  for (const payment of overduePayments) {
    const tenantId = payment.tenantId;
    const existing = await col("alerts").findOne({
      tenantId: payment.tenantId_scope || "tenant_global",
      type: "rent_overdue",
      "payload.month": currentMonth,
      "payload.tenantId": tenantId,
    });
    if (existing) continue;

    const daysOverdue = Math.floor(
      (Date.now() - new Date(payment.dueAt || now).getTime()) / (1000 * 60 * 60 * 24),
    );

    await createAlert({
      tenantId: payment.tenantId_scope || "tenant_global",
      type: "rent_overdue",
      title: `Rent overdue: ${payment.tenantName}`,
      body: `${payment.tenantName}'s rent of ₹${payment.amount.toLocaleString("en-IN")} for ${currentMonth} is ${daysOverdue > 0 ? `${daysOverdue}d overdue` : "pending"}.`,
      severity: daysOverdue > 7 ? "critical" : "warning",
      link: `/admin/rents`,
    });
  }
}

async function checkPendingBookings() {
  const pendingBookings = await col("bookings")
    .find({
      status: "pending",
      ownerLifecycle: { $in: ["created", "shared_with_owner"] },
    })
    .toArray();

  for (const booking of pendingBookings) {
    const existing = await col("alerts").findOne({
      tenantId: booking.tenantId,
      type: "booking_approval",
      "payload.bookingId": booking._id,
    });
    if (existing) continue;

    await createAlert({
      tenantId: booking.tenantId,
      type: "booking_approval",
      title: `Booking pending approval: ${booking.tenantName}`,
      body: `${booking.tenantName}'s booking at ${booking.propertyName || "unknown property"} needs owner approval.`,
      severity: "warning",
      link: `/admin/bookings`,
    });
  }
}

async function checkExitedTenants() {
  const exitedTenants = await col("tenants")
    .find({
      status: "exited",
      exitDate: {
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    })
    .toArray();

  for (const tenant of exitedTenants) {
    const existing = await col("alerts").findOne({
      tenantId: tenant.tenantId,
      type: "tenant_exited",
      "payload.tenantId": tenant._id,
    });
    if (existing) continue;

    await createAlert({
      tenantId: tenant.tenantId,
      type: "tenant_exited",
      title: `Tenant exited: ${tenant.name}`,
      body: `${tenant.name} has vacated. Update room availability and finalize deposit return.`,
      severity: "info",
      link: `/admin/tenants`,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
}
