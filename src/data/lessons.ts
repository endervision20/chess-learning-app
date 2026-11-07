export interface LessonLine {
  name: string;
  moves: string[]; // SAN
  intro: string;
  notes: Record<number, string>; // shown after ply N (1 = White's first move)
  ideas: string[];
}

export interface Lesson {
  id: string;
  opening: string; // the matching name in the openings database
  name: string;
  side: "white" | "black"; // the side the board is shown from
  summary: string;
  lines: LessonLine[];
}

export const PLANNED_LESSONS = [
  "Nimzo-Indian Defense",
  "Grünfeld Defense",
  "Catalan Opening",
  "Réti Opening",
];

/*const NAJDORF_MOVES = ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"]; 

const NAJDORF_NOTES: Record<number, string> = {
  1: "White takes the centre and opens lines for the queen and the f1 bishop.",
  2: "The Sicilian. Black fights for d4 asymmetrically, trading a wing pawn for White's central d-pawn.",
  3: "The knight develops and prepares d4.",
  4: "Black controls e5 and prepares ...Nf6 without allowing e4-e5 with tempo.",
  5: "White opens the centre.",
  6: "Black trades the c-pawn for White's d-pawn and gets the half-open c-file.",
  7: "White recaptures with a well-placed central knight.",
  8: "Develops and attacks the e4 pawn.",
  9: "Defends e4 and develops.",
  10: "The Najdorf. ...a6 stops Nb5 and Bb5+, prepares ...b5, and keeps ...e5 and ...e6 both available.",
};*/

export const LESSONS: Lesson[] = [
  /*{
    id: "najdorf",
    opening: "Sicilian Defense: Najdorf Variation",
    name: "Najdorf Sicilian",
    side: "black",
    summary:
      "Black's most ambitious answer to 1.e4. After 5...a6 Black keeps all options open and fights for the initiative, usually in sharp, heavily analysed positions.",
    lines: [
      {
        name: "English Attack (6.Be3)",
        moves: [
          ...NAJDORF_MOVES,
          "Be3", "e5", "Nb3", "Be6", "f3", "Be7", "Qd2", "O-O", "O-O-O",
          "Nbd7", "g4", "b5", "g5", "b4", "Ne2", "Ne8",
        ],
        intro:
          "White's most popular setup: Be3, f3, Qd2, long castling and a kingside pawn storm. Black counters on the queenside. It is a race, so every tempo counts.",
        notes: {
          ...NAJDORF_NOTES,
          11: "6.Be3 starts the English Attack: the bishop is ready for f3, Qd2 and a long-castling attack.",
          12: "Black challenges the d4 knight and takes space in the centre.",
          13: "The knight retreats, keeping the d-file and eyeing a5 and c5.",
          14: "Develops and prepares to trade the bishop for the b3 knight.",
          15: "Supports e4 and prepares Qd2, long castling and g4-g5.",
          16: "Develops the bishop and prepares to castle.",
          19: "Opposite-side castling: White will attack the kingside, Black will counterattack on the queenside.",
          20: "Develops the last minor piece and supports ...b5.",
          21: "The pawn storm begins.",
          22: "Black's counter: expand on the queenside before the attack lands.",
          23: "Kicks the f6 knight.",
          24: "Black gains time by hitting the c3 knight.",
          26: "The knight retreats and covers c7, d6 and g7. Black's plans include ...a5 and ...Nc5.",
        },
        ideas: [
          "White: castle long and push g4-g5 and f4-f5 to attack the king.",
          "Black: counterplay with ...b5-b4, ...a5-a4 and pressure on the c-file.",
          "Count tempi. If White's attack is slow, Black's queenside play can be faster.",
          "Black's ...d5 break is a recurring resource when the pieces are well placed.",
        ],
      },
      {
        name: "Classical (6.Be2)",
        moves: [
          ...NAJDORF_MOVES,
          "Be2", "e5", "Nb3", "Be7", "O-O", "O-O", "Be3", "Be6",
        ],
        intro:
          "The calmer setup. White develops naturally and castles kingside, aiming for a small, lasting edge. The fight is about the d5 square and about who gets in their break first.",
        notes: {
          ...NAJDORF_NOTES,
          11: "6.Be2 is the classical move: simple development, castling next, no early pawn storm.",
          12: "Black takes the centre and gains space.",
          13: "The knight retreats and eyes a5 and c5.",
          14: "A solid, natural developing move.",
          15: "Both sides castle kingside, so the middlegame is more positional.",
          17: "White completes development and keeps an eye on d4 and c5.",
          18: "Develops and challenges the d5 square.",
        },
        ideas: [
          "White: control d5, play a4 to slow ...b5, and look for a slow space advantage.",
          "Black: complete development with ...Qc7, ...Nbd7 and ...Rac8, then break with ...b5 or ...d5.",
          "Because both kings stay put, piece placement matters more than speed.",
        ],
      },
      {
        name: "Poisoned Pawn (6.Bg5)",
        moves: [
          ...NAJDORF_MOVES,
          "Bg5", "e6", "f4", "Qb6", "Qd2", "Qxb2", "Rb1", "Qa3",
        ],
        intro:
          "White's sharpest option. Black grabs the b2 pawn and White gets a big initiative. Very theory-heavy: Black can hold with exact play, but it is risky to enter without knowing the lines.",
        notes: {
          ...NAJDORF_NOTES,
          11: "6.Bg5 pins down Black's play: Bxf6 threatens to damage the pawn structure.",
          12: "A solid reply that opens the f8 bishop and covers d5 and f5.",
          13: "White builds a big centre and prepares Qf3 and e4-e5.",
          14: "The Poisoned Pawn. Black attacks b2 and the d4 knight.",
          15: "White ignores the pawn, defends the knight and prepares Rb1.",
          16: "Black takes the poisoned pawn.",
          17: "Attacks the queen.",
          18: "The queen runs to a3, far from the king. White will look for e5 and Bxf6 to open lines. This is one of the most analysed positions in chess.",
        },
        ideas: [
          "Black grabs material and gets the queen far from the defence. This is a big risk.",
          "White's usual ideas: e4-e5 to open the position and Bxf6 to wreck the king.",
          "If you choose this line, learn the theory first.",
        ],
      },
    ],
  },*/
];
  export const LESSON_BY_OPENING = new Map(LESSONS.map((l) => [l.opening, l] as const));