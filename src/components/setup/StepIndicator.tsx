type Step = 'welcome' | 'plex' | 'tmdb' | 'complete';

interface StepIndicatorProps {
  currentStep: Step;
}

const STEPS: Step[] = ['welcome', 'plex', 'tmdb', 'complete'];

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center mb-8">
      <div className="flex items-center space-x-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full ${
                currentStep === s
                  ? 'bg-decidarr-primary'
                  : STEPS.indexOf(currentStep) > i
                  ? 'bg-decidarr-primary/50'
                  : 'bg-gray-600'
              }`}
            />
            {i < STEPS.length - 1 && <div className="w-8 h-0.5 bg-gray-600" />}
          </div>
        ))}
      </div>
    </div>
  );
}
