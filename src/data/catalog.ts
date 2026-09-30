/** Porsche 911 (1978-83) spare-parts catalogue (Kat 002) -- illustration groups used by this model. */
export interface CatalogGroup { ill: string; title: string; system: SystemKey; design911?: number }
export type SystemKey =
  | 'crankcase' | 'crank' | 'pistons' | 'heads' | 'camdrive' | 'valvetrain' | 'lubrication'
  | 'cooling' | 'induction' | 'ignition' | 'exhaust' | 'clutch';

export const SYSTEMS: Record<SystemKey, { label: string; catalogGroup: string }> = {
  crankcase: { label: 'Crankcase', catalogGroup: '101' },
  crank: { label: 'Crankshaft & conrods', catalogGroup: '102' },
  pistons: { label: 'Pistons & cylinders', catalogGroup: '102' },
  heads: { label: 'Cylinder heads & cam housings', catalogGroup: '103' },
  camdrive: { label: 'Camshaft & chain drive', catalogGroup: '103' },
  valvetrain: { label: 'Valve train', catalogGroup: '103' },
  lubrication: { label: 'Oil pump & oil system', catalogGroup: '104' },
  cooling: { label: 'Fan, shroud & alternator', catalogGroup: '105' },
  induction: { label: 'Fuel injection (CIS)', catalogGroup: '106/107' },
  ignition: { label: 'Ignition', catalogGroup: '901' },
  exhaust: { label: 'Exhaust & heat exchangers', catalogGroup: '202' },
  clutch: { label: 'Clutch & flywheel', catalogGroup: '102/301' },
};

export const ILLUSTRATIONS: Record<string, CatalogGroup> = {
  '101-05': { ill: '101-05', title: 'Crankcase, left', system: 'crankcase', design911: 39152 },
  '101-10': { ill: '101-10', title: 'Crankcase, right', system: 'crankcase', design911: 39158 },
  '102-00': { ill: '102-00', title: 'Crankshaft / flywheel / connecting rod / pulley', system: 'crank', design911: 39154 },
  '102-05': { ill: '102-05', title: 'Cylinder with piston', system: 'pistons', design911: 39155 },
  '103-00': { ill: '103-00', title: 'Cylinder head', system: 'heads', design911: 39156 },
  '103-05': { ill: '103-05', title: 'Camshaft housing / chain case', system: 'heads', design911: 39157 },
  '103-10': { ill: '103-10', title: 'Valve control, left', system: 'camdrive', design911: 39159 },
  '103-15': { ill: '103-15', title: 'Valve control, right', system: 'camdrive', design911: 39160 },
  '104-00': { ill: '104-00', title: 'Engine lubrication / oil pump', system: 'lubrication', design911: 39161 },
  '105-00': { ill: '105-00', title: 'Air cooling', system: 'cooling', design911: 39165 },
  '105-05': { ill: '105-05', title: 'Air guide', system: 'cooling', design911: 39166 },
  '106-00': { ill: '106-00', title: 'Air cleaner 911 SC', system: 'induction', design911: 39168 },
  '107-00': { ill: '107-00', title: 'Mixture control unit 911 SC', system: 'induction', design911: 39171 },
  '107-10': { ill: '107-10', title: 'K-Jetronic 911 SC', system: 'induction', design911: 39174 },
  '202-00': { ill: '202-00', title: 'Exhaust system 911 SC', system: 'exhaust', design911: 39189 },
  '301-00': { ill: '301-00', title: 'Clutch', system: 'clutch', design911: 39186 },
  '901-00': { ill: '901-00', title: 'Engine electrics (ignition)', system: 'ignition' },
  '902-05': { ill: '902-05', title: 'Generator / starter', system: 'cooling' },
};

export function design911Url(ill: string): string | undefined {
  const id = ILLUSTRATIONS[ill]?.design911;
  return id ? `https://www.design911.com/diagrams/d/${id}/0` : undefined;
}
