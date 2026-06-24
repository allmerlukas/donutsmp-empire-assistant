/**
 * pokerLogic.js — shared deck, hand evaluation, and game utilities for poker games
 */

const Hand = require('pokersolver').Hand;

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Maps card display values to pokersolver format
const SOLVER_MAP = { '10': 'T', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A' };

function makeDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const val of VALUES)
      deck.push({ val, suit, display: `${val}${suit}` });
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function freshDeck() {
  return shuffle(makeDeck());
}

/** Convert a card to pokersolver notation e.g. "Ah", "Td", "5c" */
function toSolverCard(card) {
  const suitMap = { '♠️': 's', '♥️': 'h', '♦️': 'd', '♣️': 'c' };
  const val = SOLVER_MAP[card.val] || card.val;
  return `${val}${suitMap[card.suit]}`;
}

/**
 * Evaluate the best hand from a set of cards (Texas Hold'em or Five Card Draw).
 * Returns a Hand object from pokersolver.
 */
function evaluateHand(cards) {
  return Hand.solve(cards.map(toSolverCard));
}

/**
 * Find the winner(s) from a list of { userId, hand } objects.
 * hand is an array of card objects.
 * Returns array of winning userIds (can be multiple for ties).
 */
function findWinners(players) {
  const hands = players.map(p => evaluateHand(p.hand));
  const winners = Hand.winners(hands);
  const winningIndexes = hands.map((h, i) => winners.includes(h) ? i : -1).filter(i => i !== -1);
  return winningIndexes.map(i => players[i].userId);
}

/**
 * Format an array of cards into a display string.
 */
function displayCards(cards) {
  return cards.map(c => `\`${c.display}\``).join(' ');
}

module.exports = { freshDeck, evaluateHand, findWinners, displayCards, toSolverCard };
