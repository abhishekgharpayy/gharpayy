import fetch from "node-fetch";

async function test() {
  console.log("Logging in...");
  const loginRes = await fetch("http://localhost:4000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "testmwb@gharpayy.com", password: "Password123!" }),
  });
  
  if (!loginRes.ok) {
    const text = await loginRes.text();
    console.error("Login failed:", loginRes.status, text);
    // return;
  }
}
test().catch(console.error);
