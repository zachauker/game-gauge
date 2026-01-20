/**
 * Generate a URL-friendly slug from a string
 * Example: "The Legend of Zelda: Breath of the Wild" -> "the-legend-of-zelda-breath-of-the-wild"
 */
export const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Generate a unique slug by appending a number if needed
 * Example: "game-title" -> "game-title-2" if "game-title" exists
 */
export const generateUniqueSlug = async (
  baseSlug: string,
  checkAvailability: (slug: string, excludeId?: string) => Promise<boolean>,
  excludeId?: string
): Promise<string> => {
  let slug = baseSlug;
  let counter = 1;

  // Keep trying until we find an available slug
  while (!(await checkAvailability(slug, excludeId))) {
    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  return slug;
};
