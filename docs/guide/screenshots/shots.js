// The guide's screenshots, each named after the image it makes in ../images.
// Only data, so check.sh can read it without Playwright.

const kitchen = 'The kitchen Isa location.\nEnd The kitchen.\n\nStart At kitchen.\n';

module.exports = [
    {
        // Starting a new game: the first Play.
        name: 'after-play',
        files: { 'game.alan': kitchen },
        steps: [{ open: 'game.alan' }, { play: true }, { snap: true }],
    },
];
