jest.mock('../../services/igdb.service', () => ({
  igdbService: {
    searchGames: jest.fn(),
  },
}));

import { igdbController } from '../../controllers/igdb.controller';
import { igdbService } from '../../services/igdb.service';

describe('IGDBController.search — genreId passthrough', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }) as any;

  it('passes genreId through to igdbService.searchGames when provided', async () => {
    (igdbService.searchGames as jest.Mock).mockResolvedValue([]);
    const req = { query: { q: 'mario', limit: '10', genreId: '5' } } as any;
    const res = buildRes();
    const next = jest.fn();

    await igdbController.search(req, res, next);

    expect(igdbService.searchGames).toHaveBeenCalledWith('mario', 10, 5);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls igdbService.searchGames with undefined genreId when not provided', async () => {
    (igdbService.searchGames as jest.Mock).mockResolvedValue([]);
    const req = { query: { q: 'mario', limit: '10' } } as any;
    const res = buildRes();
    const next = jest.fn();

    await igdbController.search(req, res, next);

    expect(igdbService.searchGames).toHaveBeenCalledWith('mario', 10, undefined);
  });

  it('rejects a non-numeric genreId via next(error)', async () => {
    const req = { query: { q: 'mario', genreId: 'abc' } } as any;
    const res = buildRes();
    const next = jest.fn();

    await igdbController.search(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(igdbService.searchGames).not.toHaveBeenCalled();
  });

  it('rejects a negative genreId via next(error)', async () => {
    const req = { query: { q: 'mario', genreId: '-5' } } as any;
    const res = buildRes();
    const next = jest.fn();

    await igdbController.search(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(igdbService.searchGames).not.toHaveBeenCalled();
  });
});
