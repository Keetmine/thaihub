/** Мини-игра «Угадай сериал по постеру» (/game). */
export const game = {
    metaTitle: "Guess the series by its poster",
    metaDescription:
      "A little game from our catalogue: a blurred poster, four titles, one right answer. How long can you keep your streak going?",
    eyebrow: "Game",
    title: "Guess the series",
    intro:
      "We blur a poster from the catalogue — you guess which series it belongs to. Every right answer keeps your streak going.",
    question: "Which series is hiding behind the blur?",
    streak: (n: number) => `Streak: ${n}`,
    best: (n: number) => `Best: ${n}`,
    right: "Spot on!",
    wrong: "Not this one.",
    next: "One more",
    loading: "Picking a poster…",
    // Ключ раунда живёт до перезапуска сервера — редкий, но возможный
    // случай, и человек должен понять, что делать дальше.
    expired: "This round got lost along the way — let's grab a fresh one.",
    posterAlt: "A blurred series poster — that's the riddle",
    emptyTitle: "No posters to play with yet",
    emptyHint: "The game picks from series that have posters in the catalogue — come back a little later.",
    emptyCta: "Browse the series",
};
