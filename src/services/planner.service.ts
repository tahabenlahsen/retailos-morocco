import { round2 } from "@/utils/money"

/**
 * New Store Assistant — produces a transparent planning proposal from a few inputs.
 * Every number is derived from the documented assumptions below and is an ESTIMATE.
 * Assumptions are returned with the result so the UI can display them.
 */

export interface PlannerInput {
  budget: number
  businessType: string
  city: string
  storeSizeM2: number
  expectedDailyCustomers: number
  monthlyRent?: number
  employees: number
}

interface Profile {
  categories: { name: string; share: number }[] // share of inventory budget
  avgBasket: number // MAD per customer (TTC)
  grossMargin: number // fraction of HT revenue
  equipment: { item: string; cost: number; essential: boolean }[]
  inventoryShare: number // share of budget for initial stock
  rentPerM2: number // MAD / m² / month (mid-range assumption for Moroccan cities)
}

const PROFILES: Record<string, Profile> = {
  MINI_MARKET: {
    categories: [
      { name: "Boissons", share: 0.2 },
      { name: "Produits laitiers", share: 0.15 },
      { name: "Épicerie sèche", share: 0.25 },
      { name: "Snacks & confiserie", share: 0.15 },
      { name: "Entretien & hygiène", share: 0.15 },
      { name: "Boulangerie", share: 0.1 },
    ],
    avgBasket: 35,
    grossMargin: 0.18,
    equipment: [
      { item: "Caisse / TPV + tiroir-caisse", cost: 6000, essential: true },
      { item: "Scanner code-barres", cost: 600, essential: true },
      { item: "Imprimante tickets", cost: 1200, essential: true },
      { item: "Rayonnages (par 10 m²)", cost: 2500, essential: true },
      { item: "Réfrigérateur vitrine", cost: 9000, essential: true },
      { item: "Congélateur", cost: 5000, essential: false },
      { item: "Balance", cost: 1500, essential: false },
      { item: "Caméras de surveillance", cost: 3000, essential: false },
    ],
    inventoryShare: 0.55,
    rentPerM2: 90,
  },
  GROCERY: {
    categories: [
      { name: "Fruits & légumes", share: 0.3 },
      { name: "Épicerie", share: 0.25 },
      { name: "Produits laitiers", share: 0.15 },
      { name: "Boissons", share: 0.15 },
      { name: "Conserves", share: 0.15 },
    ],
    avgBasket: 45,
    grossMargin: 0.2,
    equipment: [
      { item: "Caisse / TPV", cost: 5000, essential: true },
      { item: "Balance homologuée", cost: 2500, essential: true },
      { item: "Étals & rayonnages (par 10 m²)", cost: 2000, essential: true },
      { item: "Réfrigérateur", cost: 8000, essential: true },
      { item: "Imprimante tickets", cost: 1200, essential: false },
    ],
    inventoryShare: 0.5,
    rentPerM2: 80,
  },
  CLOTHING: {
    categories: [
      { name: "Femme", share: 0.4 },
      { name: "Homme", share: 0.3 },
      { name: "Enfant", share: 0.15 },
      { name: "Accessoires", share: 0.15 },
    ],
    avgBasket: 250,
    grossMargin: 0.45,
    equipment: [
      { item: "Caisse / TPV", cost: 5000, essential: true },
      { item: "Portants & mannequins", cost: 8000, essential: true },
      { item: "Cabines d'essayage", cost: 6000, essential: true },
      { item: "Miroirs & éclairage", cost: 5000, essential: true },
      { item: "Antivols", cost: 4000, essential: false },
      { item: "Enseigne & vitrine", cost: 10000, essential: false },
    ],
    inventoryShare: 0.5,
    rentPerM2: 150,
  },
  ELECTRONICS: {
    categories: [
      { name: "Téléphones", share: 0.35 },
      { name: "Accessoires", share: 0.3 },
      { name: "Informatique", share: 0.2 },
      { name: "Audio", share: 0.15 },
    ],
    avgBasket: 600,
    grossMargin: 0.15,
    equipment: [
      { item: "Caisse / TPV + TPE", cost: 7000, essential: true },
      { item: "Vitrines sécurisées", cost: 12000, essential: true },
      { item: "Caméras & alarme", cost: 6000, essential: true },
      { item: "Éclairage LED", cost: 3000, essential: false },
    ],
    inventoryShare: 0.6,
    rentPerM2: 180,
  },
  COSMETICS: {
    categories: [
      { name: "Soins visage", share: 0.3 },
      { name: "Maquillage", share: 0.25 },
      { name: "Cheveux", share: 0.2 },
      { name: "Parfums", share: 0.15 },
      { name: "Hygiène", share: 0.1 },
    ],
    avgBasket: 180,
    grossMargin: 0.4,
    equipment: [
      { item: "Caisse / TPV", cost: 5000, essential: true },
      { item: "Présentoirs & vitrines", cost: 10000, essential: true },
      { item: "Miroirs & éclairage", cost: 4000, essential: true },
      { item: "Testeurs & mobilier", cost: 3000, essential: false },
    ],
    inventoryShare: 0.5,
    rentPerM2: 160,
  },
  RESTAURANT: {
    categories: [
      { name: "Matières premières", share: 0.6 },
      { name: "Boissons", share: 0.25 },
      { name: "Consommables", share: 0.15 },
    ],
    avgBasket: 70,
    grossMargin: 0.6,
    equipment: [
      { item: "Cuisine professionnelle", cost: 60000, essential: true },
      { item: "Caisse / TPV", cost: 6000, essential: true },
      { item: "Mobilier salle", cost: 25000, essential: true },
      { item: "Réfrigération", cost: 15000, essential: true },
      { item: "Hotte & ventilation", cost: 12000, essential: true },
    ],
    inventoryShare: 0.15,
    rentPerM2: 130,
  },
  PHARMACY: {
    categories: [
      { name: "Parapharmacie", share: 0.4 },
      { name: "Hygiène", share: 0.25 },
      { name: "Bébé", share: 0.2 },
      { name: "Compléments", share: 0.15 },
    ],
    avgBasket: 120,
    grossMargin: 0.3,
    equipment: [
      { item: "Caisse / TPV", cost: 6000, essential: true },
      { item: "Comptoir & rayonnages", cost: 15000, essential: true },
      { item: "Réfrigérateur", cost: 6000, essential: true },
      { item: "Climatisation", cost: 8000, essential: false },
    ],
    inventoryShare: 0.55,
    rentPerM2: 140,
  },
  OTHER: {
    categories: [{ name: "Assortiment principal", share: 0.7 }, { name: "Accessoires / complémentaires", share: 0.3 }],
    avgBasket: 80,
    grossMargin: 0.3,
    equipment: [
      { item: "Caisse / TPV", cost: 5000, essential: true },
      { item: "Rayonnages / présentoirs", cost: 6000, essential: true },
      { item: "Enseigne", cost: 5000, essential: false },
    ],
    inventoryShare: 0.5,
    rentPerM2: 100,
  },
}

const ASSUMPTIONS = {
  smigMonthly: 3200, // approx. Moroccan SMIG incl. charges (assumption; update in code as regulation changes)
  electricityPerM2: 12, // MAD / m² / month
  internet: 400,
  otherFixed: 800, // misc. supplies, bank fees…
  openDaysPerMonth: 26,
  workingCapitalShare: 0.15, // reserve kept aside
  vatRate: 0.2,
}

export function plan(input: PlannerInput) {
  const p = PROFILES[input.businessType] ?? PROFILES.OTHER
  const rent = input.monthlyRent ?? round2(input.storeSizeM2 * p.rentPerM2)

  // Equipment: essential items scaled by size where relevant
  const sizeFactor = Math.max(1, Math.ceil(input.storeSizeM2 / 10))
  const equipment = p.equipment.map((e) => ({ ...e, cost: e.item.includes("par 10 m²") ? e.cost * sizeFactor : e.cost }))
  const essentialEquipment = round2(equipment.filter((e) => e.essential).reduce((a, e) => a + e.cost, 0))
  const optionalEquipment = round2(equipment.filter((e) => !e.essential).reduce((a, e) => a + e.cost, 0))

  // Budget allocation
  const deposit = round2(rent * 2) // 2 months deposit (common practice)
  const setup = essentialEquipment + deposit + rent // first month rent
  const workingCapital = round2(input.budget * ASSUMPTIONS.workingCapitalShare)
  const inventoryBudget = round2(Math.max(0, input.budget - setup - workingCapital))
  const budgetSufficient = inventoryBudget >= input.budget * 0.25

  const categories = p.categories.map((c) => ({ name: c.name, share: c.share, budget: round2(inventoryBudget * c.share) }))

  // Recurring monthly expenses
  const salaries = round2(input.employees * ASSUMPTIONS.smigMonthly)
  const electricity = round2(input.storeSizeM2 * ASSUMPTIONS.electricityPerM2)
  const recurring = [
    { item: "Loyer", amount: rent },
    { item: "Salaires (SMIG × employés)", amount: salaries },
    { item: "Électricité", amount: electricity },
    { item: "Internet", amount: ASSUMPTIONS.internet },
    { item: "Divers (fournitures, frais bancaires)", amount: ASSUMPTIONS.otherFixed },
  ]
  const monthlyFixed = round2(recurring.reduce((a, r) => a + r.amount, 0))

  // Revenue & break-even
  const monthlyRevenueTTC = round2(input.expectedDailyCustomers * p.avgBasket * ASSUMPTIONS.openDaysPerMonth)
  const monthlyRevenueHT = round2(monthlyRevenueTTC / (1 + ASSUMPTIONS.vatRate))
  const monthlyGrossProfit = round2(monthlyRevenueHT * p.grossMargin)
  const monthlyNet = round2(monthlyGrossProfit - monthlyFixed)
  const breakEvenRevenueHT = round2(monthlyFixed / p.grossMargin)
  const breakEvenCustomersPerDay = Math.ceil(breakEvenRevenueHT * (1 + ASSUMPTIONS.vatRate) / p.avgBasket / ASSUMPTIONS.openDaysPerMonth)
  const paybackMonths = monthlyNet > 0 ? round2((setup + inventoryBudget) / monthlyNet) : null

  return {
    disclaimer: "Toutes les valeurs sont des estimations basées sur des hypothèses moyennes. Elles ne constituent en aucun cas une garantie de résultat financier.",
    inputs: { ...input, monthlyRent: rent },
    assumptions: { ...ASSUMPTIONS, avgBasket: p.avgBasket, grossMargin: p.grossMargin, rentPerM2: p.rentPerM2 },
    budgetAllocation: {
      essentialEquipment,
      optionalEquipment,
      deposit,
      firstMonthRent: rent,
      workingCapital,
      inventoryBudget,
      total: round2(essentialEquipment + deposit + rent + workingCapital + inventoryBudget),
      sufficient: budgetSufficient,
      warning: budgetSufficient ? null : "Le budget laisse moins de 25 % pour le stock initial. Envisagez de réduire l'équipement optionnel, la surface ou d'augmenter le budget.",
    },
    equipment,
    categories,
    recurringMonthly: { items: recurring, total: monthlyFixed },
    projection: {
      monthlyRevenueTTC,
      monthlyRevenueHT,
      monthlyGrossProfit,
      monthlyNetProfit: monthlyNet,
      breakEvenRevenueHT,
      breakEvenCustomersPerDay,
      currentCustomersPerDay: input.expectedDailyCustomers,
      paybackMonths,
    },
    formulas: [
      "Loyer = surface × loyer/m² (ou valeur saisie)",
      "Budget stock = budget − (équipement essentiel + caution 2 mois + 1er loyer) − réserve 15 %",
      "CA mensuel TTC = clients/jour × panier moyen × 26 jours",
      "Bénéfice brut = CA HT × marge brute",
      "Bénéfice net = bénéfice brut − charges fixes mensuelles",
      "Seuil de rentabilité (CA HT) = charges fixes ÷ marge brute",
      "Retour sur investissement (mois) = (installation + stock) ÷ bénéfice net mensuel",
    ],
  }
}
