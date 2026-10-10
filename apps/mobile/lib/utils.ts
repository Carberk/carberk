import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const controlHeights = ["control-sm", "control-md", "control-lg", "control-icon", "control-tabBar"];

/**
 * tailwind-merge only knows Tailwind's stock scales. The mobile token
 * utilities are registered here so a later class replaces an earlier one of
 * the same kind: without this, `text-headline` would be read as a text colour
 * and drop `text-foreground`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "title",
            "headline",
            "subhead",
            "body",
            "callout",
            "footnote",
            "caption",
            "micro",
          ],
        },
      ],
      shadow: [{ shadow: ["raised", "floating", "overlay"] }],
      h: [{ h: controlHeights }],
      "min-h": [{ "min-h": controlHeights }],
      "min-w": [{ "min-w": controlHeights }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
