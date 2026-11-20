declare var process: {
  env: {
    EXPO_PUBLIC_GROQ_API_KEY?: string;
    EXPO_PUBLIC_GEMINI_API_KEY?: string;
    EXPO_PUBLIC_NVIDIA_NIM_API_KEY?: string;
    EXPO_PUBLIC_DEMO_MODE?: string;
    EXPO_PUBLIC_NOTIFICATIONS?: string;
    [key: string]: string | undefined;
  };
};
