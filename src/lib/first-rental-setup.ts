import { apiClient } from "./api-client";

export type FirstRentalStepId =
  | "VEHICLES" | "PEOPLE" | "PRICING" | "AVAILABILITY" | "BOOKING" | "HANDOVER";

export interface FirstRentalStep {
  id: FirstRentalStepId;
  label: string;
  description: string;
  section: string;
  complete: boolean;
}

export interface FirstRentalStatus {
  tenantId: string;
  state: "NOT_STARTED" | "IN_PROGRESS" | "DISMISSED" | "COMPLETED";
  visibleOnOverview: boolean;
  completedAt: string | null;
  dismissedAt: string | null;
  completedCount: number;
  totalCount: number;
  calculatedAt: string;
  steps: FirstRentalStep[];
}

export const firstRentalSetupApi = {
  getStatus: () => apiClient.get<FirstRentalStatus>("/tenant/setup-status"),
  updateVisibility: (action: "DISMISS" | "RESTORE") =>
    apiClient.post<FirstRentalStatus & { changed: boolean }>("/tenant/setup-status/visibility", { action }),
};
