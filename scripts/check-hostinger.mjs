import { validateHostingerConfig } from "./hostinger-config.mjs";

try {
  validateHostingerConfig(process.env);
  console.log("Hostinger deployment configuration validated. No secret values logged.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
