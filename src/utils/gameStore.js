/**
 * gameStore.js — in-memory store for active blackjack games
 * Games don't need to persist across restarts.
 */

const games = new Map(); // gameId -> game object

function createGame(data) {
  const game = {
    ...data,
    players: {},
    deck:    [],
    dealer:  { hand: [] },
    phase:   'lobby',
    lobbyMsg: null,
  };
  games.set(data.gameId, game);
  return game;
}

function getGame(gameId)   { return games.get(gameId) || null; }
function deleteGame(gameId) { games.delete(gameId); }

function updateGame(gameId, updates) {
  const game = games.get(gameId);
  if (game) Object.assign(game, updates);
}

/** Find a game where userId is host or an active player */
function getGameByUser(userId) {
  for (const game of games.values())
    if (game.hostId === userId || game.players[userId]) return game;
  return null;
}

module.exports = { createGame, getGame, updateGame, deleteGame, getGameByUser };
