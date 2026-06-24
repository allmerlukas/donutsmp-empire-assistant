/**
 * cardUtils.js — deck creation, hand evaluation, formatting for blackjack
 */

const SUITS  = ['♠', '♥', '♦', '♣'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const value of VALUES)
      deck.push({ suit, value });
  return shuffle([...deck]);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardValue(card) {
  if (card.value === 'A') return 11;
  if (['J','Q','K','10'].includes(card.value)) return 10;
  return parseInt(card.value);
}

function handTotal(hand) {
  let total = hand.reduce((sum, c) => sum + cardValue(c), 0);
  let aces  = hand.filter(c => c.value === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function formatCard(card) { return `\`${card.value}${card.suit}\``; }
function formatHand(hand) { return hand.map(formatCard).join(' '); }
function isBlackjack(hand) { return hand.length === 2 && handTotal(hand) === 21; }

module.exports = { createDeck, handTotal, formatHand, formatCard, isBlackjack };
