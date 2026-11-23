import { probeRecordStore } from "./record-store";
// ============================================================================
// CAR HIRE OS — DATABASE READINESS & HEALTH PROBE (DEV-007, DATA-002)
// ============================================================================
export interface DatabaseHealthStatus {
    isReady: boolean;
    latencyMs: number;
    provider: "sqlite" | "postgres";
    timestamp: string;
    error?: string;
}
export class DatabaseHealthService {
    /**
     * Checks database connectivity and readiness by executing a lightweight ping query
     */
    static async checkReadiness(): Promise<DatabaseHealthStatus> {
        const start = Date.now();
        try {
            (await probeRecordStore());
            const latencyMs = Date.now() - start;
            return {
                isReady: true,
                latencyMs: Math.max(1, latencyMs),
                provider: process.env.RECORD_STORE_BACKEND === "postgres" ? "postgres" : "sqlite",
                timestamp: new Date().toISOString(),
            };
        }
        catch (err) {
            return {
                isReady: false,
                latencyMs: Date.now() - start,
                provider: process.env.RECORD_STORE_BACKEND === "postgres" ? "postgres" : "sqlite",
                timestamp: new Date().toISOString(),
                error: (err as Error).message,
            };
        }
    }
}
