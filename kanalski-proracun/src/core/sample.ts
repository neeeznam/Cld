// Primjer projekta: dovodni sistem kancelarije sa odvojcima i lastinim repom, i mali odsisni sistem.
import { PALETTE_BY_KEY, defaultSizing, makeNode, newId } from './catalog';
import type { Node, Project, SysKind, System } from './types';

type Spec = [key: string, p?: Record<string, number | string>, children?: (Spec | null)[], extra?: Partial<Node>];

function build(sys: System, spec: Spec): string {
  const [key, p, children, extra] = spec;
  const n = makeNode(PALETTE_BY_KEY[key]);
  Object.assign(n.p, p || {});
  Object.assign(n, extra || {});
  sys.nodes[n.id] = n;
  (children || []).forEach((c, i) => {
    if (c) n.out[i] = build(sys, c);
  });
  return n.id;
}

function system(name: string, kind: SysKind, spec: Spec): System {
  const sys: System = { id: newId('s'), name, kind, root: '', nodes: {}, sizing: defaultSizing() };
  sys.root = build(sys, spec);
  return sys;
}

const D = (Q: number): Spec => ['diffuser', { Q, dp: 25 }];

export function sampleProject(): Project {
  const supply = system('Dovod — kancelarije', 'supply', [
    'ahu', { name: 'KK-1' }, [
      ['silencer', { dp: 35 }, [
        ['duct-rect', { L: 8 }, [
          ['elbow', {}, [
            ['duct-rect', { L: 6 }, [
              ['tee', {}, [
                ['duct-rect', { L: 5 }, [
                  ['tee', {}, [
                    ['duct-rect', { L: 4 }, [['elbow', {}, [['duct-rect', { L: 2 }, [D(400)]]]]]],
                    ['duct-rect', { L: 2.5 }, [D(400)]],
                  ]],
                ]],
                ['duct-rect', { L: 3 }, [
                  ['damper', {}, [
                    ['duct-rect', { L: 2 }, [
                      ['dovetail', {}, [
                        ['duct-rect', { L: 3 }, [D(300)]],
                        ['duct-rect', { L: 3 }, [D(300)]],
                      ]],
                    ]],
                  ]],
                ]],
              ]],
            ]],
          ]],
        ]],
      ]],
    ],
  ]);
  const exhaust = system('Odsis — sanitarni čvor', 'exhaust', [
    'ahu', { name: 'KK-1' }, [
      ['duct-round', { L: 6 }, [
        ['tee', {}, [
          ['duct-round', { L: 4 }, [['valve', { Q: 100, dp: 30 }]]],
          ['duct-round', { L: 2 }, [['valve', { Q: 100, dp: 30 }]]],
        ]],
      ]],
    ],
  ]);
  return { version: 1, name: 'Primjer', t: 20, z: 0, eps: 0.09, systems: [supply, exhaust] };
}

export function emptyProject(): Project {
  const sys: System = { id: newId('s'), name: 'Dovod 1', kind: 'supply', root: '', nodes: {}, sizing: defaultSizing() };
  return { version: 1, name: 'Novi projekat', t: 20, z: 0, eps: 0.09, systems: [sys] };
}
