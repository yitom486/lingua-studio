export interface KanaRowGuideExample {
  word: string;
  reading: string;
  meaning: string;
}

export interface KanaRowGuideContent {
  title: string;
  summary: string;
  memoryTip: string;
  pronunciationTip: string;
  confusions: readonly string[];
  examples: readonly KanaRowGuideExample[];
}
