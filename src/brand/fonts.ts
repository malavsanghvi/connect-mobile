/**
 * The brand kit's three faces, bundled with the app (SIL Open Font License: the licence files sit beside the fonts in
 * assets/fonts). Static instances of Bricolage Grotesque (display), Hanken Grotesk (everything else) and JetBrains Mono
 * (identifiers only: receipt, pledge, household and member numbers, codes), the same files
 * the Google Fonts packages ship, so a phone and the web build set the same type without a network request. The keys are
 * the family names `fonts` in src/theme.ts uses; the root layout registers them with expo-font. Being assets, they travel
 * in an over-the-air update like any other JavaScript bundle asset.
 */
export const brandFontAssets = {
  BricolageGrotesque_600SemiBold: require('../../assets/fonts/BricolageGrotesque_600SemiBold.ttf'),
  BricolageGrotesque_700Bold: require('../../assets/fonts/BricolageGrotesque_700Bold.ttf'),
  HankenGrotesk_400Regular: require('../../assets/fonts/HankenGrotesk_400Regular.ttf'),
  HankenGrotesk_500Medium: require('../../assets/fonts/HankenGrotesk_500Medium.ttf'),
  HankenGrotesk_600SemiBold: require('../../assets/fonts/HankenGrotesk_600SemiBold.ttf'),
  HankenGrotesk_700Bold: require('../../assets/fonts/HankenGrotesk_700Bold.ttf'),
  JetBrainsMono_500Medium: require('../../assets/fonts/JetBrainsMono_500Medium.ttf'),
} as const;

export type BrandFontFamily = keyof typeof brandFontAssets;
