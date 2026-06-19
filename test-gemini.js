async function test() {
  console.log("1. Logging in...");
  const loginRes = await fetch("http://localhost:4000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "superadmin@gharpayy.com", username: "superadmin@gharpayy.com", password: "superadmin#gharpayy" })
  });
  
  if (!loginRes.ok) {
    console.error("Login failed:", await loginRes.text());
    return;
  }
  const { token } = await loginRes.json();
  console.log("Got token:", token.substring(0, 10) + "...");

  console.log("2. Hitting /api/leads/parse...");
  const rawText = "Hi, my name is John Doe. I am looking for a 1BHK in Koramangala. My budget is 15k and I want to move in by next week. My phone number is 9876543210.";
  
  const parseRes = await fetch("http://localhost:4000/api/leads/parse", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ text: rawText })
  });

  const responseText = await parseRes.text();
  console.log(`Status: ${parseRes.status}`);
  console.log("Response:", responseText);
}
test();
