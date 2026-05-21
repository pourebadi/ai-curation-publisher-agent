export type AiPhaseOneStub = {
  id: "phase1-ai-stub";
  realProviderCallsEnabled: false;
};

export function createAiPhaseOneStub(): AiPhaseOneStub {
  return {
    id: "phase1-ai-stub",
    realProviderCallsEnabled: false
  };
}
