// TEST-ONLY executable. No public API mocking route is present in the application.
export {};
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("Fixtures may only run in a _test database");
const { workOnce } = await import("../../src/lib/queue");
const { sql } = await import("../../src/db/client");
let calls=0;
while(await workOnce(async provider=>{calls++;return {status:"succeeded",text:`TEST SYNTHÉTIQUE — ${calls<=7?"Karburo. ":""}Concurrent Test.`,model:`fixture-${provider}`,requestId:`e2e-fixture-${calls}`,input:100,output:50,raw:{syntheticFixture:true},citations:[]};}));
await sql.end();
