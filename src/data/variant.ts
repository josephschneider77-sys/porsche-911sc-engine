/**
 * Engine variant for this build. Kat 502 (USA 911 '83) is the source of truth.
 * The shipped model is the 1978 US 49-state engine, type 930/04 (catalogue '930.04').
 * 930/03 and 930/06 differ only on the rows in VARIANT_TABLE; swap ENGINE_VARIANT to retarget them.
 */
export type EngineVariant = '930/03' | '930/04' | '930/06';

export const ENGINE_VARIANT: EngineVariant = '930/04';

export interface VariantSpec {
  /** 102-00 #10 crankshaft distributor drive wheel. */
  driveWheel: string;
  /** 108-00 air injection is fitted. */
  airInjection: boolean;
  /** 202-05 EGR is fitted. */
  egr: boolean;
  /** 202-00 #6 front exhaust element. */
  frontExhaust: 'pre-silencer' | 'catalytic-converter';
}

/** Kat 502 variant table (audit §2). Fan pulley 911 106 208 00 is the two-groove half on all three. */
export const VARIANT_TABLE: Record<EngineVariant, VariantSpec> = {
  '930/03': {
    driveWheel: '930 102 115 01',
    airInjection: false,
    egr: false,
    frontExhaust: 'pre-silencer',
  },
  '930/04': {
    driveWheel: '930 102 115 02',
    airInjection: true,
    egr: true,
    frontExhaust: 'catalytic-converter',
  },
  '930/06': {
    driveWheel: '930 102 115 02',
    airInjection: true,
    egr: true,
    frontExhaust: 'catalytic-converter',
  },
};

export const VARIANT: VariantSpec = VARIANT_TABLE[ENGINE_VARIANT];
