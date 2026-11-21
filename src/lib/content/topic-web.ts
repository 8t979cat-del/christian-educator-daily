/**
 * The web of topics a teacher explores to have AI write a new devotional.
 * Each topic links to related ones; clicking a topic brings its neighbours
 * around it. Every topic listed as related also has its own links.
 */
export const START_TOPICS = ["Patience", "Kindness", "Courage", "Forgiveness", "Gratitude", "Honesty", "Friendship", "Hope"] as const;

export const TOPIC_WEB: Record<string, readonly string[]> = {
  Patience: ["Waiting", "Self-control", "Kindness", "Perseverance", "Listening", "Gentleness"],
  Kindness: ["Compassion", "Including others", "Gentleness", "Generosity", "Patience", "Encouragement"],
  Courage: ["Fear and worry", "Standing up for others", "Trying new things", "Honesty", "Hope", "Perseverance"],
  Forgiveness: ["Saying sorry", "Second chances", "Peace", "Grace", "Friendship", "Humility"],
  Gratitude: ["Contentment", "Joy", "Generosity", "Creation", "Hope", "Prayer"],
  Honesty: ["Integrity", "Saying sorry", "Courage", "Trust", "Fairness", "Humility"],
  Friendship: ["Including others", "Loyalty", "Trust", "Forgiveness", "Encouragement", "Listening"],
  Hope: ["Fear and worry", "Joy", "Perseverance", "Prayer", "New beginnings", "God's faithfulness"],
  Waiting: ["Patience", "Trust", "Prayer", "Hope", "Contentment", "Self-control"],
  "Self-control": ["Patience", "Anger", "Choices", "Honesty", "Peace", "Perseverance"],
  Perseverance: ["Hard work", "Trying new things", "Hope", "Courage", "Patience", "Mistakes and growth"],
  Listening: ["Friendship", "Patience", "Humility", "Prayer", "Compassion", "Wisdom"],
  Gentleness: ["Kindness", "Patience", "Anger", "Humility", "Peace", "Compassion"],
  Compassion: ["Kindness", "Serving others", "Listening", "Including others", "Grace", "Generosity"],
  "Including others": ["Friendship", "Kindness", "Belonging", "Fairness", "Compassion", "Encouragement"],
  Generosity: ["Gratitude", "Serving others", "Kindness", "Contentment", "Joy", "Compassion"],
  Encouragement: ["Kindness", "Friendship", "Words", "Hope", "Including others", "Joy"],
  "Fear and worry": ["Courage", "Hope", "Prayer", "Trust", "Peace", "God's faithfulness"],
  "Standing up for others": ["Courage", "Fairness", "Compassion", "Including others", "Honesty", "Serving others"],
  "Trying new things": ["Courage", "Mistakes and growth", "Perseverance", "Hope", "New beginnings", "Trust"],
  "Saying sorry": ["Forgiveness", "Honesty", "Humility", "Peace", "Second chances", "Friendship"],
  "Second chances": ["Forgiveness", "Grace", "New beginnings", "Mistakes and growth", "Hope", "Saying sorry"],
  Peace: ["Forgiveness", "Prayer", "Gentleness", "Fear and worry", "Trust", "Contentment"],
  Grace: ["Forgiveness", "Second chances", "Compassion", "Humility", "God's faithfulness", "Gratitude"],
  Humility: ["Listening", "Serving others", "Honesty", "Grace", "Saying sorry", "Wisdom"],
  Contentment: ["Gratitude", "Joy", "Waiting", "Generosity", "Peace", "Trust"],
  Joy: ["Gratitude", "Hope", "Encouragement", "Creation", "Friendship", "Contentment"],
  Creation: ["Gratitude", "Stewardship", "Joy", "Wonder", "Serving others", "God's faithfulness"],
  Prayer: ["Trust", "Gratitude", "Fear and worry", "Hope", "Listening", "Peace"],
  Integrity: ["Honesty", "Choices", "Trust", "Courage", "Fairness", "Wisdom"],
  Trust: ["God's faithfulness", "Friendship", "Honesty", "Fear and worry", "Waiting", "Prayer"],
  Fairness: ["Honesty", "Including others", "Standing up for others", "Integrity", "Kindness", "Choices"],
  Loyalty: ["Friendship", "Trust", "Integrity", "Encouragement", "Serving others", "Honesty"],
  "New beginnings": ["Hope", "Second chances", "Trying new things", "Grace", "Courage", "Joy"],
  "God's faithfulness": ["Trust", "Hope", "Prayer", "Grace", "Creation", "Peace"],
  Anger: ["Self-control", "Gentleness", "Forgiveness", "Peace", "Words", "Choices"],
  Choices: ["Wisdom", "Integrity", "Self-control", "Honesty", "Fairness", "Mistakes and growth"],
  "Hard work": ["Perseverance", "Stewardship", "Serving others", "Mistakes and growth", "Joy", "Integrity"],
  "Mistakes and growth": ["Perseverance", "Second chances", "Trying new things", "Grace", "Humility", "Hard work"],
  "Serving others": ["Compassion", "Generosity", "Humility", "Kindness", "Hard work", "Standing up for others"],
  Belonging: ["Including others", "Friendship", "God's faithfulness", "Encouragement", "Joy", "Trust"],
  Words: ["Encouragement", "Honesty", "Kindness", "Anger", "Listening", "Wisdom"],
  Wisdom: ["Choices", "Listening", "Humility", "Integrity", "Prayer", "Words"],
  Stewardship: ["Creation", "Hard work", "Gratitude", "Generosity", "Serving others", "Choices"],
  Wonder: ["Creation", "Joy", "Gratitude", "God's faithfulness", "Prayer", "Hope"],
};

export const MAX_TOPICS = 6;
