interface WelcomeStepProps {
  onGetStarted: () => void;
}

export default function WelcomeStep({ onGetStarted }: WelcomeStepProps) {
  return (
    <div className="text-center">
      <h1 className="text-3xl font-bold text-decidarr-primary mb-4">Welcome to Decidarr</h1>
      <p className="text-gray-300 mb-2">Your personal movie and TV show randomizer</p>
      <p className="text-gray-400 text-sm mb-8">
        Sign in with Plex as the server owner to get started.
      </p>
      <button
        onClick={onGetStarted}
        className="w-full bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors"
      >
        Get Started
      </button>
    </div>
  );
}
