import type { NextConfig } from "next";
const config: NextConfig = { devIndicators: false, env: { NEXT_PUBLIC_DEMO_ACCESS: process.env.NEXT_PUBLIC_DEMO_ACCESS ?? "" } };
export default config;
