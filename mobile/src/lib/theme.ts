// Editorial, fashion-magazine-inspired design system: a warm ivory canvas,
// a Bodoni-style display serif for headlines (the same family of typeface
// mastheads like Vogue use), and a small palette of jewel-tone accents
// color-coded per ritual type.

export const colors = {
  background: "#FAF6F0",
  surface: "#FFFFFF",
  surfaceMuted: "#F1E9DE",
  ink: "#1B1611",
  muted: "#8A7F72",
  border: "#E8DFD3",
  berry: "#B0335C",
  gold: "#C9A24B",
  teal: "#2E6E62",
  terracotta: "#C1652F",
  plum: "#6B4A8A",
} as const;

export const gradients = {
  primary: [colors.berry, colors.terracotta] as const,
  gold: [colors.gold, colors.terracotta] as const,
};

export const fonts = {
  display: "BodoniModa_700Bold",
  displaySemibold: "BodoniModa_600SemiBold",
  displayItalic: "BodoniModa_500Medium_Italic",
  displayBlack: "BodoniModa_900Black",
};

export const FONT_ASSETS = {
  BodoniModa_500Medium_Italic: require("@expo-google-fonts/bodoni-moda/500Medium_Italic/BodoniModa_500Medium_Italic.ttf"),
  BodoniModa_600SemiBold: require("@expo-google-fonts/bodoni-moda/600SemiBold/BodoniModa_600SemiBold.ttf"),
  BodoniModa_700Bold: require("@expo-google-fonts/bodoni-moda/700Bold/BodoniModa_700Bold.ttf"),
  BodoniModa_900Black: require("@expo-google-fonts/bodoni-moda/900Black/BodoniModa_900Black.ttf"),
};

const RITUAL_ACCENTS: Record<string, string> = {
  sauna: colors.terracotta,
  walk: colors.teal,
  "run club": colors.berry,
  yoga: colors.plum,
};

export function accentForRitual(ritualType: string | undefined): string {
  if (!ritualType) return colors.gold;
  return RITUAL_ACCENTS[ritualType.toLowerCase()] ?? colors.gold;
}
