import { describe, expect, it } from 'vitest';
import { Flow } from '../src/flow.js';
import * as FlowTemplates from '../src/flow-templates.js';
import { reduceFlow, stretchFlow } from '../src/flow-utils.js';

describe('Flow', () => {
  it('should normalize characteristics to average of 100', () => {
    const flow = new Flow([1, 2, 3, 4]);
    const chars = flow.getFlowCharacteristics();
    const avg = chars.reduce((a, b) => a + b, 0) / chars.length;
    expect(avg).toBeCloseTo(100, 5);
  });

  it('should produce equivalent normalized flows for proportional inputs', () => {
    const flow1 = new Flow([1, 2, 3, 4]);
    const flow2 = new Flow([100, 200, 300, 400]);
    const chars1 = flow1.getFlowCharacteristics();
    const chars2 = flow2.getFlowCharacteristics();
    for (let i = 0; i < chars1.length; i++) {
      expect(chars1[i]).toBeCloseTo(chars2[i], 10);
    }
  });

  it('should reject negative values', () => {
    expect(() => new Flow([-1, 2, 3])).toThrow();
  });

  it('should reject all-zero values', () => {
    expect(() => new Flow([0, 0, 0])).toThrow();
  });

  it('should reject empty arrays', () => {
    expect(() => new Flow([])).toThrow();
  });

  it('getStepSize should return proportional steps', () => {
    const flow = new Flow(FlowTemplates.constantSpeed());
    // Constant speed: each step should be roughly equal
    const distance = 100;
    const steps = 10;
    const sizes: number[] = [];
    for (let i = 0; i < steps; i++) {
      sizes.push(flow.getStepSize(distance, steps, i / steps));
    }
    // All steps should be roughly equal for constant speed
    for (const size of sizes) {
      expect(size).toBeCloseTo(distance / steps, 0);
    }
  });

  it('getStepSize should sum to approximately the total distance', () => {
    const flow = new Flow(FlowTemplates.variatingFlow());
    const distance = 500;
    const steps = 50;
    let totalStep = 0;
    for (let i = 0; i < steps; i++) {
      totalStep += flow.getStepSize(distance, steps, i / steps);
    }
    expect(totalStep).toBeCloseTo(distance, 0);
  });

  it('getStepSize should return 0 for zero distance', () => {
    const flow = new Flow(FlowTemplates.constantSpeed());
    const size = flow.getStepSize(0, 10, 0.5);
    expect(size).toBe(0);
  });
});

describe('FlowTemplates', () => {
  const templates = [
    ['constantSpeed', FlowTemplates.constantSpeed],
    ['variatingFlow', FlowTemplates.variatingFlow],
    ['interruptedFlow', FlowTemplates.interruptedFlow],
    ['interruptedFlow2', FlowTemplates.interruptedFlow2],
    ['slowStartupFlow', FlowTemplates.slowStartupFlow],
    ['slowStartup2Flow', FlowTemplates.slowStartup2Flow],
    ['jaggedFlow', FlowTemplates.jaggedFlow],
    ['stoppingFlow', FlowTemplates.stoppingFlow],
    ['adjustingFlow', FlowTemplates.adjustingFlow],
  ] as const;

  for (const [name, template] of templates) {
    it(`${name} should produce a valid Flow`, () => {
      const chars = template();
      expect(chars.length).toBeGreaterThan(0);
      const flow = new Flow(chars);
      expect(flow.getBucketCount()).toBe(chars.length);
    });
  }

  it('randomFlow should produce 100 elements', () => {
    const chars = FlowTemplates.randomFlow(Math.random);
    expect(chars.length).toBe(100);
    const flow = new Flow(chars);
    expect(flow.getBucketCount()).toBe(100);
  });
});

describe('FlowUtils', () => {
  it('reduceFlow should produce shorter arrays', () => {
    const original = FlowTemplates.variatingFlow();
    const reduced = reduceFlow(original, 20);
    expect(reduced.length).toBe(20);
  });

  it('reduceFlow should throw if target >= original length', () => {
    const flow = [1, 2, 3];
    expect(() => reduceFlow(flow, 3)).toThrow();
    expect(() => reduceFlow(flow, 5)).toThrow();
  });

  it('stretchFlow should produce longer arrays', () => {
    const original = [10, 20, 30, 40, 50];
    const stretched = stretchFlow(original, 20);
    expect(stretched.length).toBe(20);
  });

  it('stretchFlow should throw if target < original length', () => {
    const flow = [1, 2, 3, 4, 5];
    expect(() => stretchFlow(flow, 3)).toThrow();
  });

  it('stretchFlow should apply modifier', () => {
    const flow = [10, 20, 30];
    const stretched = stretchFlow(flow, 10, (v) => v * 2);
    for (const v of stretched) {
      expect(v).toBeGreaterThan(0);
    }
  });

  it('stretchFlow should handle single-element arrays', () => {
    const stretched = stretchFlow([42], 10);
    expect(stretched.length).toBe(10);
    for (const v of stretched) {
      expect(v).toBe(42);
    }
  });

  it('stretchFlow single-element with modifier', () => {
    const stretched = stretchFlow([10], 5, (v) => v * 3);
    expect(stretched.length).toBe(5);
    for (const v of stretched) {
      expect(v).toBe(30);
    }
  });
});
