import fetch from "node-fetch";

async function test() {
  console.log("Logging in...");
  const loginRes = await fetch("http://localhost:4000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "superadmin@gharpayy.com", password: "Password123!" }),
  });
  
  if (!loginRes.ok) {
    const text = await loginRes.text();
    console.error("Login failed:", loginRes.status, text);
    return;
  }
  
  const { token } = await loginRes.json();
  console.log("Logged in. Token:", token.substring(0, 20) + "...");
  
  console.log("Fetching leads...");
  const leadsRes = await fetch("http://localhost:4000/api/v1/admin/leads", {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  
  if (!leadsRes.ok) {
    const text = await leadsRes.text();
    console.error("Leads failed:", leadsRes.status, text);
    return;
  }
  
  const data = await leadsRes.json();
  console.log("Leads success!");
  console.log("Response keys:", Object.keys(data));
  if (data.rows) console.log("Rows count:", data.rows.length);
  else console.log("NO ROWS FIELD!");
}

test().catch(console.error);
