import type { CameraView } from '../settings';
import { ChaseView } from './chase-view';
import { ClassicView } from './classic-view';
import { IsoView } from './iso-view';
import type { RoadView } from './view';

/** One instance of each camera view, all drawing the same engine state. */
export function createViews(): Record<CameraView, RoadView> {
  return { chase: new ChaseView(), classic: new ClassicView(), iso: new IsoView() };
}
