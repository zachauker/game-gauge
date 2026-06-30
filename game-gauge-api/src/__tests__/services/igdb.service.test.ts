import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('IGDBService.searchGames — genreId filtering', () => {
  let postMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    postMock = jest.fn().mockResolvedValue({ status: 200, data: [] });

    // axios.create() returns the client used for /games requests
    mockedAxios.create = jest.fn().mockReturnValue({
      post: postMock,
    }) as any;

    // axios.post (module-level) is used for the Twitch OAuth token request
    mockedAxios.post = jest.fn().mockResolvedValue({
      data: { access_token: 'test-token', expires_in: 3600 },
    }) as any;
  });

  // Import after mocks are set up so the client picks up the mocked axios.create
  const loadService = () => {
    let IGDBService: typeof import('../../services/igdb.service').IGDBService;
    jest.isolateModules(() => {
      IGDBService = require('../../services/igdb.service').IGDBService;
    });
    return new IGDBService!();
  };

  it('includes a "where genres = (id)" clause when genreId is provided', async () => {
    const service = loadService();
    await service.searchGames('zelda', 10, 5);

    expect(postMock).toHaveBeenCalledTimes(1);
    const [, queryBody] = postMock.mock.calls[0];
    expect(queryBody).toContain('where genres = (5);');
  });

  it('does not include a "where genres" clause when genreId is omitted', async () => {
    const service = loadService();
    await service.searchGames('zelda', 10);

    expect(postMock).toHaveBeenCalledTimes(1);
    const [, queryBody] = postMock.mock.calls[0];
    expect(queryBody).not.toContain('where genres');
  });
});
