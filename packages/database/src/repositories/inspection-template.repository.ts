import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — INSPECTION TEMPLATE REPOSITORY (DOM-003 §21, DEV-004)
// Bounded Context: Vehicle Inspections & Checklist Definitions
// ============================================================================

import type {
  InspectionTemplate,
  InspectionTemplateSection,
  InspectionTemplateItem,
  CreateInspectionTemplateDto,
} from "@carhire/types";
import {
  RecordNotFoundError,
  InspectionTemplateNotFoundError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IInspectionTemplateRepository {
  create(
    tenantId: string,
    data: CreateInspectionTemplateDto,
    tx?: TransactionContext
  ): Promise<InspectionTemplate>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<InspectionTemplate | null>;

  findByCode(
    code: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<InspectionTemplate | null>;

  findDefault(
    tenantId: string,
    category?: string,
    tx?: TransactionContext
  ): Promise<InspectionTemplate | null>;

  listTemplates(
    tenantId: string,
    tx?: TransactionContext
  ): Promise<InspectionTemplate[]>;
}

export class InspectionTemplateRepository implements IInspectionTemplateRepository {
  private static templateStore = createRecordStore<string, InspectionTemplate>("inspection-template.repository:templateStore");

  static clear(): void {
    InspectionTemplateRepository.templateStore.clear();
  }

  private getDefaultStandardSections(): InspectionTemplateSection[] {
    return [
      {
        id: "sec_exterior",
        title: "Exterior Body & Panels",
        description: "Examine all exterior body panels, paintwork, bumpers, and trim",
        order: 1,
        items: [
          {
            id: "item_front_bumper",
            code: "FRONT_BUMPER",
            label: "Front Bumper & Grille",
            itemType: "CONDITION",
            required: true,
            requiresEvidence: false,
            options: ["GOOD", "FAIR", "POOR", "DAMAGED"],
            defaultCondition: "GOOD",
            order: 1,
          },
          {
            id: "item_rear_bumper",
            code: "REAR_BUMPER",
            label: "Rear Bumper & Diffuser",
            itemType: "CONDITION",
            required: true,
            requiresEvidence: false,
            options: ["GOOD", "FAIR", "POOR", "DAMAGED"],
            defaultCondition: "GOOD",
            order: 2,
          },
          {
            id: "item_hood_roof",
            code: "HOOD_AND_ROOF",
            label: "Hood, Bonnet & Roof Condition",
            itemType: "CONDITION",
            required: true,
            requiresEvidence: false,
            options: ["GOOD", "FAIR", "POOR", "DAMAGED"],
            defaultCondition: "GOOD",
            order: 3,
          },
          {
            id: "item_doors_panels",
            code: "SIDE_DOORS_PANELS",
            label: "Side Doors & Quarter Panels",
            itemType: "CONDITION",
            required: true,
            requiresEvidence: false,
            options: ["GOOD", "FAIR", "POOR", "DAMAGED"],
            defaultCondition: "GOOD",
            order: 4,
          },
        ],
      },
      {
        id: "sec_glass_lighting",
        title: "Glass, Mirrors & Lighting",
        description: "Windshield, windows, side mirrors, and full lighting cluster",
        order: 2,
        items: [
          {
            id: "item_windshield",
            code: "WINDSHIELD_GLASS",
            label: "Front Windshield & Rear Glass (Chips/Cracks)",
            itemType: "CONDITION",
            required: true,
            requiresEvidence: false,
            options: ["GOOD", "FAIR", "POOR", "DAMAGED"],
            defaultCondition: "GOOD",
            order: 1,
          },
          {
            id: "item_mirrors",
            code: "SIDE_MIRRORS",
            label: "Side Mirrors & Indicator Lights",
            itemType: "BOOLEAN",
            required: true,
            requiresEvidence: false,
            order: 2,
          },
          {
            id: "item_headlights",
            code: "HEADLIGHTS_TAILLIGHTS",
            label: "Headlights, High Beams & Taillights Operational",
            itemType: "BOOLEAN",
            required: true,
            requiresEvidence: false,
            order: 3,
          },
          {
            id: "item_turn_indicators",
            code: "TURN_INDICATORS_HAZARDS",
            label: "Turn Indicators & Hazard Warning Lights",
            itemType: "BOOLEAN",
            required: true,
            requiresEvidence: false,
            order: 4,
          },
        ],
      },
      {
        id: "sec_tires_wheels",
        title: "Tires, Wheels & Brakes",
        description: "Tire tread depth, rims, inflation pressure, and braking response",
        order: 3,
        items: [
          {
            id: "item_tire_tread",
            code: "TIRE_TREAD_CONDITION",
            label: "Tire Tread Depth & Sidewall Integrity (All 4 Tires)",
            itemType: "CONDITION",
            required: true,
            requiresEvidence: false,
            options: ["GOOD", "FAIR", "POOR", "DAMAGED"],
            defaultCondition: "GOOD",
            order: 1,
          },
          {
            id: "item_wheel_rims",
            code: "WHEEL_RIMS_HUBCAPS",
            label: "Alloy Rims / Hubcaps Condition (Curb Rash Check)",
            itemType: "CONDITION",
            required: false,
            requiresEvidence: false,
            options: ["GOOD", "FAIR", "POOR", "DAMAGED"],
            defaultCondition: "GOOD",
            order: 2,
          },
          {
            id: "item_spare_wheel",
            code: "SPARE_WHEEL_PRESENT",
            label: "Spare Wheel Present & Inflated",
            itemType: "BOOLEAN",
            required: true,
            requiresEvidence: false,
            order: 3,
          },
        ],
      },
      {
        id: "sec_interior_cabin",
        title: "Cabin Interior & Cleanliness",
        description: "Upholstery, dashboard, infotainment, AC, and floor mats",
        order: 4,
        items: [
          {
            id: "item_cleanliness_interior",
            code: "CLEANLINESS_INTERIOR",
            label: "Interior Cabin Cleanliness",
            itemType: "SELECT",
            required: true,
            requiresEvidence: false,
            options: ["CLEAN", "MODERATE", "DIRTY", "STAINED"],
            order: 1,
          },
          {
            id: "item_air_conditioning",
            code: "AC_HEATING_SYSTEM",
            label: "Air Conditioning & Climate Control Working",
            itemType: "BOOLEAN",
            required: true,
            requiresEvidence: false,
            order: 2,
          },
          {
            id: "item_seat_upholstery",
            code: "SEAT_UPHOLSTERY_CONDITION",
            label: "Seats, Seatbelts & Upholstery Condition",
            itemType: "CONDITION",
            required: true,
            requiresEvidence: false,
            options: ["GOOD", "FAIR", "POOR", "DAMAGED"],
            defaultCondition: "GOOD",
            order: 3,
          },
          {
            id: "item_wipers_horn",
            code: "WIPERS_AND_HORN",
            label: "Windshield Wipers, Washers & Horn Functional",
            itemType: "BOOLEAN",
            required: true,
            requiresEvidence: false,
            order: 4,
          },
        ],
      },
      {
        id: "sec_safety_tools",
        title: "Safety Equipment & Tools",
        description: "Emergency kit, jack, tools, and fire safety accessories",
        order: 5,
        items: [
          {
            id: "item_jack_and_tools",
            code: "JACK_AND_LUG_WRENCH",
            label: "Hydraulic/Scissor Jack & Wheel Lug Wrench",
            itemType: "BOOLEAN",
            required: true,
            requiresEvidence: false,
            order: 1,
          },
          {
            id: "item_warning_triangles",
            code: "WARNING_TRIANGLES",
            label: "Reflective Emergency Warning Triangles (Pair)",
            itemType: "BOOLEAN",
            required: true,
            requiresEvidence: false,
            order: 2,
          },
          {
            id: "item_fire_extinguisher",
            code: "FIRE_EXTINGUISHER",
            label: "Certified In-Date Fire Extinguisher",
            itemType: "BOOLEAN",
            required: true,
            requiresEvidence: false,
            order: 3,
          },
          {
            id: "item_first_aid_kit",
            code: "FIRST_AID_KIT",
            label: "First Aid Medical Emergency Kit",
            itemType: "BOOLEAN",
            required: true,
            requiresEvidence: false,
            order: 4,
          },
        ],
      },
    ];
  }

  async create(
    tenantId: string,
    data: CreateInspectionTemplateDto,
    _tx?: TransactionContext
  ): Promise<InspectionTemplate> {
    const id = `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const template: InspectionTemplate = {
      id,
      tenantId,
      code: data.code.toUpperCase(),
      name: data.name,
      description: data.description,
      category: data.category || "STANDARD",
      version: 1,
      isDefault: data.isDefault ?? false,
      isActive: true,
      sections: data.sections.map((sec, sIdx) => ({
        id: `sec_${sIdx + 1}_${Date.now()}`,
        title: sec.title,
        description: sec.description,
        order: sec.order,
        items: sec.items.map((item, iIdx) => ({
          id: `item_${sIdx + 1}_${iIdx + 1}_${Date.now()}`,
          code: item.code.toUpperCase(),
          label: item.label,
          description: item.description,
          itemType: item.itemType,
          required: item.required,
          requiresEvidence: item.requiresEvidence,
          options: item.options,
          defaultCondition: item.defaultCondition,
          order: item.order,
        })),
      })),
      createdAt: now,
      updatedAt: now,
    };

    InspectionTemplateRepository.templateStore.set(id, template);
    return template;
  }

  async findById(
    id: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<InspectionTemplate | null> {
    const template = InspectionTemplateRepository.templateStore.get(id);
    if (!template) {
      // Auto-bootstrap default if standard requested
      if (id === "tmpl_standard_default" || id.startsWith("default")) {
        return this.bootstrapDefaultTemplate(tenantId);
      }
      return null;
    }
    if (template.tenantId !== tenantId) {
      throw new CrossTenantViolationError(template.tenantId, tenantId);
    }
    return template;
  }

  async findByCode(
    code: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<InspectionTemplate | null> {
    const uppercaseCode = code.toUpperCase();
    for (const template of InspectionTemplateRepository.templateStore.values()) {
      if (template.tenantId === tenantId && template.code === uppercaseCode) {
        return template;
      }
    }
    if (uppercaseCode === "STANDARD_15_POINT" || uppercaseCode === "DEFAULT") {
      return this.bootstrapDefaultTemplate(tenantId);
    }
    return null;
  }

  async findDefault(
    tenantId: string,
    _category = "STANDARD",
    _tx?: TransactionContext
  ): Promise<InspectionTemplate | null> {
    for (const template of InspectionTemplateRepository.templateStore.values()) {
      if (template.tenantId === tenantId && template.isDefault && template.isActive) {
        return template;
      }
    }
    return this.bootstrapDefaultTemplate(tenantId);
  }

  async listTemplates(
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<InspectionTemplate[]> {
    const templates = Array.from(InspectionTemplateRepository.templateStore.values()).filter(
      (t) => t.tenantId === tenantId && t.isActive
    );

    if (templates.length === 0) {
      const defaultTemplate = await this.bootstrapDefaultTemplate(tenantId);
      return [defaultTemplate];
    }

    return templates;
  }

  private async bootstrapDefaultTemplate(tenantId: string): Promise<InspectionTemplate> {
    const existing = Array.from(InspectionTemplateRepository.templateStore.values()).find(
      (t) => t.tenantId === tenantId && t.code === "STANDARD_15_POINT"
    );
    if (existing) return existing;

    const id = `tmpl_std_${tenantId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10)}`;
    const now = new Date().toISOString();

    const template: InspectionTemplate = {
      id,
      tenantId,
      code: "STANDARD_15_POINT",
      name: "Standard Comprehensive 15-Point Inspection",
      description: "Full exterior, cabin, mechanical, lighting, and safety kit audit template",
      category: "STANDARD",
      version: 1,
      isDefault: true,
      isActive: true,
      sections: this.getDefaultStandardSections(),
      createdAt: now,
      updatedAt: now,
    };

    InspectionTemplateRepository.templateStore.set(id, template);
    return template;
  }
}
