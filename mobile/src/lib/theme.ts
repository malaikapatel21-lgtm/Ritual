// Bold retro-poster design system: think vintage athletic-club and
// wellness-retreat signage — aged cream paper stock, ink-black type, a
// chunky slab-serif display face, and a flat duotone palette with no
// soft gradients. Distinctive on purpose, not a fashion-magazine look.

export const colors = {
  paper: "#F2E6CE",
  paperDeep: "#E8D8AF",
  surface: "#FBF4E2",
  ink: "#201A14",
  muted: "#6B5D48",
  border: "#201A14",
  rust: "#C1440E",
  pine: "#26402F",
  mustard: "#E0A030",
  denim: "#3D5A73",
} as const;

export const fonts = {
  display: "AlfaSlabOne_400Regular",
  label: "BarlowCondensed_700Bold",
  labelSemibold: "BarlowCondensed_600SemiBold",
  body: "Archivo_400Regular",
  bodyMedium: "Archivo_500Medium",
  bodySemibold: "Archivo_600SemiBold",
  bodyBold: "Archivo_700Bold",
};

export const FONT_ASSETS = {
  AlfaSlabOne_400Regular: require("@expo-google-fonts/alfa-slab-one/400Regular/AlfaSlabOne_400Regular.ttf"),
  BarlowCondensed_600SemiBold: require("@expo-google-fonts/barlow-condensed/600SemiBold/BarlowCondensed_600SemiBold.ttf"),
  BarlowCondensed_700Bold: require("@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf"),
  Archivo_400Regular: require("@expo-google-fonts/archivo/400Regular/Archivo_400Regular.ttf"),
  Archivo_500Medium: require("@expo-google-fonts/archivo/500Medium/Archivo_500Medium.ttf"),
  Archivo_600SemiBold: require("@expo-google-fonts/archivo/600SemiBold/Archivo_600SemiBold.ttf"),
  Archivo_700Bold: require("@expo-google-fonts/archivo/700Bold/Archivo_700Bold.ttf"),
};

const RITUAL_ACCENTS: Record<string, string> = {
  sauna: colors.rust,
  walk: colors.pine,
  "run club": colors.denim,
  yoga: colors.mustard,
};

export function accentForRitual(ritualType: string | undefined): string {
  if (!ritualType) return colors.mustard;
  return RITUAL_ACCENTS[ritualType.toLowerCase()] ?? colors.mustard;
}
