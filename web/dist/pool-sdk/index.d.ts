// Copyright (c) Meta Platforms, Inc. and affiliates.

export type { Ball, BallBallFriction, BallId, BallParams, BallState, CircularCushionSegment, CushionFriction, CushionResponse, EquipmentIds, LinearCushionSegment, MotionState, PinchBoost, Pocket, Quat, SystemState, Table, Vec3, } from './types.js';
export { MOTION_STATES, defaultBallParams } from './types.js';
export type { BallSetEntry, Calibration, CalibrationKind, ClothEntry, CueEntry, CushionModelEntry, EquipmentAxis, EquipmentCatalog, MeasuredParam, TableEntry, } from './catalog.js';
export { CATALOG, CATALOG_VERSION, DEFAULT_EQUIPMENT, DISCIPLINE_DEFAULT_CUE_IDS, EQUIPMENT_AXES, EquipmentError, calibrationKind, catalogEntries, catalogEntry, isDefaultEquipment, miscueGeometryOf, validateEquipmentIds, } from './catalog.js';
export type { ClothPreset, ClothPresetId, CueParams, CushionModel, MiscueGeometry, ShotParams, SimOptions, StrikePinchModel, TangentialCompliance, } from './shot.js';
export { ShotBuilder, ValidationError, applyCloth, clothPreset, defaultOptions, gripFittedCushionResponse, gripFittedOptions, mathavanFittedOptions, realisticOptions, validateCueParams, validateShot, } from './shot.js';
export type { BallPlacement, Scenario } from './scenario.js';
export { EPS_KISS, EPS_SPACE, EPS_SPIN, EPS_VEL, ScenarioBuilder, scenarioToJson, validatePlacements, } from './scenario.js';
export type { Event, EventKind, ShotRecord, ShotStats } from './record.js';
export { FORMAT_VERSION, RecordError, parseShotRecord, recordDuration, validateRecordShape, } from './record.js';
export type { BallSampleView, KernelSampler } from './sampler.js';
export { FLOATS_PER_BALL, MOTION_CODES, Sampler } from './sampler.js';
export type { KernelModule, WasmGlueModule } from './engine.js';
export { Engine, EngineError, init } from './engine.js';
