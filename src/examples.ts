/**
 * Models bundled with the app, so a visitor can see what Orikata does without uploading anything.
 * These are the same files the test fixtures use; `tests/unit/fixtures.test.ts` checks each one is
 * a rigid fold of a single sheet.
 */
export interface Example {
  name: string;
  title: string;
  blurb: string;
}

export const EXAMPLES: readonly Example[] = [
  {
    name: "book-fold",
    title: "Book fold",
    blurb: "One valley crease down the middle. The simplest fold there is.",
  },
  {
    name: "book-fold-90",
    title: "Book fold, in two steps",
    blurb: "The same fold, paused half way so you can see it standing upright.",
  },
  {
    name: "diagonal-twice",
    title: "Diagonal, then in half",
    blurb: "Two folds in sequence, the second moving both layers at once.",
  },
  {
    name: "waterbomb-base",
    title: "Waterbomb base",
    blurb: "Eight creases collapsing together, the corners rising to meet.",
  },
  {
    name: "preliminary-base",
    title: "Preliminary base",
    blurb: "The waterbomb turned inside out, then flattened into a diamond.",
  },
  {
    name: "accordion-pleat",
    title: "Accordion pleat",
    blurb: "Six panels folding as one, down to a flat stack.",
  },
  {
    name: "miura-ori",
    title: "Miura-ori",
    blurb: "A tessellation of forty-eight panels with a single degree of freedom.",
  },
  {
    name: "paper-airplane",
    title: "Paper airplane",
    blurb: "The classic dart from an A4 sheet, ending with the wings opened level.",
  },
  {
    name: "crane",
    title: "Crane",
    blurb: "The traditional orizuru: preliminary base, petal folds, reverse folds, wings spread.",
  },
  {
    name: "miura-map",
    title: "Miura map fold",
    blurb: "The fold used for maps and solar panels: eighty panels close into one flat stack.",
  },
  {
    name: "road-map",
    title: "Road map",
    blurb:
      "Accordion into eight, then halve three times: 64 layers, each fold through all before it.",
  },
] as const;

export function findExample(name: string): Example | undefined {
  return EXAMPLES.find((example) => example.name === name);
}
