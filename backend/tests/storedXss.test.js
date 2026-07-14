'use strict';

// Proves that user-generated content is sanitized in the service layer BEFORE
// it is handed to the persistence layer — i.e. a stored-XSS payload can never
// be written to the database. The model + audit layers are mocked so no real
// DB is needed; we assert on exactly what the service tries to persist.

jest.mock('../src/models/eventModel');
jest.mock('../src/models/userModel');
jest.mock('../src/services/auditService', () => ({
  record: jest.fn(() => Promise.resolve()),
  ACTIONS: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

const eventModel = require('../src/models/eventModel');
const userModel = require('../src/models/userModel');
const eventService = require('../src/services/eventService');
const profileService = require('../src/services/profileService');

const XSS = "<script>alert('XSS')</script>";

beforeEach(() => {
  jest.clearAllMocks();
  eventModel.create.mockImplementation((orgId, data) => Promise.resolve({ id: 'e1', organizer_id: orgId, ...data }));
  userModel.updateProfile.mockImplementation((id, data) => Promise.resolve({ id, full_name: data.fullName, bio: data.bio }));
  userModel.publicView.mockImplementation((row) => row);
});

describe('Stored XSS — event content sanitized before storage', () => {
  test('script payload in title/description is neutralised', async () => {
    const organizer = { id: 'u1', role: 'organizer' };
    await eventService.create(organizer, {
      title: `${XSS}Concert`,
      description: '<img src=x onerror=alert(1)>Great show',
      location: '<b>Hall</b>',
      category: 'music',
      startsAt: '2027-01-01T10:00:00Z',
      capacity: 100,
      ticketPrice: 0,
    }, { ip: '127.0.0.1', headers: {} });

    const stored = eventModel.create.mock.calls[0][1];
    expect(stored.title).toBe('Concert');
    expect(stored.title).not.toMatch(/<script/i);
    expect(stored.description).not.toMatch(/onerror/i);
    expect(stored.description).not.toMatch(/<img/i);
    expect(stored.description).toContain('Great show'); // safe text preserved
    expect(stored.location).toBe('Hall');
  });
});

describe('Stored XSS — profile content sanitized before storage', () => {
  test('script/handler payloads in fullName and bio are neutralised', async () => {
    await profileService.updateMe('u1', {
      fullName: `${XSS}Alice`,
      bio: '<a href="javascript:alert(1)">hi</a><p onclick="evil()">bio text</p>',
    });

    const stored = userModel.updateProfile.mock.calls[0][1];
    expect(stored.fullName).toBe('Alice');
    expect(stored.bio).not.toMatch(/javascript:/i);
    expect(stored.bio).not.toMatch(/onclick/i);
    expect(stored.bio).toContain('bio text'); // safe text preserved
  });

  test('safe content is preserved unchanged', async () => {
    await profileService.updateMe('u1', { fullName: 'Bob Smith', bio: 'I organise events.' });
    const stored = userModel.updateProfile.mock.calls[0][1];
    expect(stored.fullName).toBe('Bob Smith');
    expect(stored.bio).toBe('I organise events.');
  });
});
