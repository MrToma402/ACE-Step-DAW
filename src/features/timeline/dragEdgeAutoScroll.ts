interface HorizontalEdgeAutoScrollConfig {
  edgeThresholdPx?: number;
  maxStepPx?: number;
}

interface HorizontalEdgeAutoScrollInput {
  pointerClientX: number;
  viewportLeft: number;
  viewportRight: number;
  scrollLeft: number;
  maxScrollLeft: number;
  config?: HorizontalEdgeAutoScrollConfig;
}

interface VerticalEdgeAutoScrollInput {
  pointerClientY: number;
  viewportTop: number;
  viewportBottom: number;
  scrollTop: number;
  maxScrollTop: number;
  config?: HorizontalEdgeAutoScrollConfig;
}

const DEFAULT_EDGE_THRESHOLD_PX = 64;
const DEFAULT_MAX_STEP_PX = 24;

export function resolveHorizontalEdgeAutoScrollDelta(
  input: HorizontalEdgeAutoScrollInput,
): number {
  const edgeThreshold = input.config?.edgeThresholdPx ?? DEFAULT_EDGE_THRESHOLD_PX;
  const maxStep = input.config?.maxStepPx ?? DEFAULT_MAX_STEP_PX;
  if (edgeThreshold <= 0 || maxStep <= 0) return 0;
  if (input.viewportRight <= input.viewportLeft || input.maxScrollLeft <= 0) return 0;

  const leftEdge = input.viewportLeft + edgeThreshold;
  const rightEdge = input.viewportRight - edgeThreshold;
  let desiredDelta = 0;

  if (input.pointerClientX < leftEdge) {
    const edgeDistance = leftEdge - input.pointerClientX;
    desiredDelta = -Math.min(maxStep, (edgeDistance / edgeThreshold) * maxStep);
  } else if (input.pointerClientX > rightEdge) {
    const edgeDistance = input.pointerClientX - rightEdge;
    desiredDelta = Math.min(maxStep, (edgeDistance / edgeThreshold) * maxStep);
  }

  const clampedScrollLeft = Math.max(0, Math.min(input.maxScrollLeft, input.scrollLeft + desiredDelta));
  return clampedScrollLeft - input.scrollLeft;
}

export function resolveVerticalEdgeAutoScrollDelta(
  input: VerticalEdgeAutoScrollInput,
): number {
  const edgeThreshold = input.config?.edgeThresholdPx ?? DEFAULT_EDGE_THRESHOLD_PX;
  const maxStep = input.config?.maxStepPx ?? DEFAULT_MAX_STEP_PX;
  if (edgeThreshold <= 0 || maxStep <= 0) return 0;
  if (input.viewportBottom <= input.viewportTop || input.maxScrollTop <= 0) return 0;

  const topEdge = input.viewportTop + edgeThreshold;
  const bottomEdge = input.viewportBottom - edgeThreshold;
  let desiredDelta = 0;

  if (input.pointerClientY < topEdge) {
    const edgeDistance = topEdge - input.pointerClientY;
    desiredDelta = -Math.min(maxStep, (edgeDistance / edgeThreshold) * maxStep);
  } else if (input.pointerClientY > bottomEdge) {
    const edgeDistance = input.pointerClientY - bottomEdge;
    desiredDelta = Math.min(maxStep, (edgeDistance / edgeThreshold) * maxStep);
  }

  const clampedScrollTop = Math.max(0, Math.min(input.maxScrollTop, input.scrollTop + desiredDelta));
  return clampedScrollTop - input.scrollTop;
}
