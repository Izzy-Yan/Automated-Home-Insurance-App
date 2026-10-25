export type Question = {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  options?: string[];
};

export type QuestionSection = {
  id: string;
  title: string;
  questions: Question[];
};

export const questionnaire: QuestionSection[] = [
  {
    id: "property",
    title: "Property Information",
    questions: [
      {
        key: "number_of_stories",
        label: "Number of stories",
        type: "number",
      },
      {
        key: "living_area_sq_ft",
        label: "Approximate living area (square feet)",
        type: "number",
      },
      {
        key: "foundation_type",
        label: "Foundation type",
        type: "select",
        options: [
          "Slab",
          "Crawl space",
          "Basement",
          "Pier and beam",
          "Other",
          "Unknown",
        ],
      },
      {
        key: "exterior_wall_type",
        label: "Exterior wall type",
        type: "select",
        options: [
          "Wood siding",
          "Stucco",
          "Brick",
          "Stone",
          "Vinyl siding",
          "Fiber cement",
          "Other",
          "Unknown",
        ],
      },
      {
        key: "roof_type",
        label: "Roof type",
        type: "select",
        options: [
          "Asphalt shingle",
          "Tile",
          "Metal",
          "Wood shake",
          "Flat roof",
          "Other",
          "Unknown",
        ],
      },
    ],
  },

  {
    id: "systems",
    title: "Major Systems",
    questions: [
      {
        key: "hvac_type",
        label: "HVAC system",
        type: "select",
        options: [
          "Central air",
          "Heat pump",
          "Window units",
          "Evaporative cooler",
          "Other",
          "Unknown",
        ],
      },
      {
        key: "water_heater_type",
        label: "Water heater type",
        type: "select",
        options: [
          "Tank",
          "Tankless",
          "Heat pump",
          "Other",
          "Unknown",
        ],
      },
      {
        key: "electrical_service",
        label: "Electrical service",
        type: "select",
        options: [
          "100 amp",
          "150 amp",
          "200 amp",
          "400 amp",
          "Other",
          "Unknown",
        ],
      },
      {
        key: "plumbing_type",
        label: "Primary plumbing material",
        type: "select",
        options: [
          "Copper",
          "PEX",
          "PVC",
          "Galvanized",
          "Other",
          "Unknown",
        ],
      },
    ],
  },
];