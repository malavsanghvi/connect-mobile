/**
 * Shared pay flow: startPayment() for every Pay button, runSaving() for every
 * multi-step save, and <PayHost/> (mounted once in the root layout) that draws
 * the Pay sheet, the "Saving" screen and "Thank you". See controller.ts.
 */
export * from './controller';
export { PayHost } from './host';
