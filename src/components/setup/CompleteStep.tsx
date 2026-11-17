interface CompleteStepProps {
  onStartExploring: () => void;
}

export default function CompleteStep({ onStartExploring }: CompleteStepProps) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">You&apos;re All Set!</h2>
      <p className="text-gray-400 mb-8">Decidarr is ready to help you discover your next watch.</p>
      <button
        onClick={onStartExploring}
        className="w-full bg-decidarr-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-decidarr-primary/90 transition-colors"
      >
        Start Exploring
      </button>
    </div>
  );
}
