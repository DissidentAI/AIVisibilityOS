// Planning assumptions only; no customer data or financial forecast.
const usdToEur = 0.92; // Scenario assumption, NOT a live exchange rate.
const pairUsd = (300 * 0.4 + 800 * 1.6 + 300 * 0.1 + 800 * 0.4) / 1e6;
const plans = [
  { name: "Starter", price: 39, queries: 10, infrastructure: 3, storage: 0.5, supportMinutes: 5 },
  {
    name: "Professional",
    price: 99,
    queries: 50,
    infrastructure: 6,
    storage: 1,
    supportMinutes: 15,
  },
  { name: "Agency", price: 249, queries: 200, infrastructure: 15, storage: 3, supportMinutes: 45 },
];
const rows = plans.map((p) => {
  const responses = p.queries * 2 * 3 * 30,
    apiUsd = p.queries * 3 * 30 * pairUsd,
    apiEur = apiUsd * usdToEur;
  const payment = p.price * (0.015 + 0.007) + 0.25,
    support = (p.supportMinutes / 60) * 30;
  const estimatedCost = apiEur + p.infrastructure + p.storage + support + payment;
  const stressCost = apiEur * 3 + p.infrastructure + p.storage + support * 2 + payment;
  return {
    plan: p.name,
    responses,
    apiUsd,
    apiEur,
    payment,
    estimatedCost,
    stressCost,
    contributionBeforeFixedCosts: p.price - estimatedCost,
  };
});
console.log(
  JSON.stringify(
    {
      assumptions: {
        date: "2026-10-31",
        samples: 3,
        days: 30,
        inputTokens: 300,
        outputTokens: 800,
        usdToEur,
        supportHourlyEur: 30,
        pricesExcludeVat: true,
      },
      scenarios: rows,
    },
    null,
    2,
  ),
);
