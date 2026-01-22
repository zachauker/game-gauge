import { generateSlug } from '../../utils/slug.util';

describe('Slug Utilities', () => {
  describe('generateSlug', () => {
    it('should convert text to lowercase slug', () => {
      // Act
      const result = generateSlug('The Legend of Zelda');

      // Assert
      expect(result).toBe('the-legend-of-zelda');
    });

    it('should replace spaces with hyphens', () => {
      // Act
      const result = generateSlug('Super Mario Bros');

      // Assert
      expect(result).toBe('super-mario-bros');
    });

    it('should remove special characters', () => {
      // Act
      const result = generateSlug('Grand Theft Auto: Vice City!');

      // Assert
      expect(result).toBe('grand-theft-auto-vice-city');
    });

    it('should handle multiple consecutive spaces', () => {
      // Act
      const result = generateSlug('Game    Title');

      // Assert
      expect(result).toBe('game-title');
    });

    it('should remove leading and trailing hyphens', () => {
      // Act
      const result = generateSlug('  Game Title  ');

      // Assert
      expect(result).not.toMatch(/^-|-$/);
    });

    it('should handle unicode characters', () => {
      // Act
      const result = generateSlug('Pokémon');

      // Assert
      expect(result).toBe('pokmon');
    });

    it('should handle numbers', () => {
      // Act
      const result = generateSlug('Battlefield 2042');

      // Assert
      expect(result).toBe('battlefield-2042');
    });

    it('should handle empty string', () => {
      // Act
      const result = generateSlug('');

      // Assert
      expect(result).toBe('');
    });

    it('should collapse multiple hyphens', () => {
      // Act
      const result = generateSlug('Game---Title');

      // Assert
      expect(result).toBe('game-title');
    });
  });
});
