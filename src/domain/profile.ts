import {
  ASSUME_PAVED_HIGHWAYS,
  BAD_SMOOTHNESS,
  DESIGNATED_PATHS,
  GOOD_SMOOTHNESS,
  ROAD_TAGS,
  SURFACE_TAGS,
} from './classify';
import { PREF_FACTOR, type BikeType, type RoutingSettings, type TrailLevel } from './settings';

/** `highway=a|b|c` */
const is = (key: string, values: string[]) => `${key}=${values.join('|')}`;
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''));

const HILLS = {
  ignore: { uphillcost: 0, uphillcutoff: 1.5 },
  moderate: { uphillcost: 40, uphillcutoff: 2 },
  strong: { uphillcost: 100, uphillcutoff: 1.5 },
} as const;

/** Fahrphysik je Radtyp – bestimmt die geschätzte Fahrzeit. */
const KINEMATICS: Record<
  BikeType,
  { totalMass: number; maxSpeed: number; S_C_x: number; C_r: number; bikerPower: number }
> = {
  road: { totalMass: 85, maxSpeed: 55, S_C_x: 0.25, C_r: 0.005, bikerPower: 160 },
  gravel: { totalMass: 90, maxSpeed: 50, S_C_x: 0.3, C_r: 0.008, bikerPower: 150 },
  mtb: { totalMass: 95, maxSpeed: 45, S_C_x: 0.4, C_r: 0.012, bikerPower: 140 },
  trekking: { totalMass: 100, maxSpeed: 40, S_C_x: 0.45, C_r: 0.007, bikerPower: 130 },
};

/** mtb:scale-Werte (aus BRouters lookups.dat) je Stufe */
const MTB_SCALE = ['0-', '0', '0+', '1-', '1', '1+', '2-', '2', '2+', '3', '4', '5', '6'];
/** sac_scale ab dieser Stufe zu schwer, wenn mtb:scale fehlt */
const SAC_TOO_HARD: Record<Exclude<TrailLevel, 'none'>, string[]> = {
  '0': [
    'mountain_hiking',
    'demanding_mountain_hiking',
    'alpine_hiking',
    'demanding_alpine_hiking',
    'difficult_alpine_hiking',
  ],
  '1': ['demanding_mountain_hiking', 'alpine_hiking', 'demanding_alpine_hiking', 'difficult_alpine_hiking'],
  '2': ['alpine_hiking', 'demanding_alpine_hiking', 'difficult_alpine_hiking'],
  '3': ['demanding_alpine_hiking', 'difficult_alpine_hiking'],
};

/** Sperrt Trails über der gewählten Schwierigkeit. */
export function trailChain(level: TrailLevel): string {
  if (level === 'none') return 'assign trailfactor = 1';
  const max = Number(level);
  const tooHard = MTB_SCALE.filter((v) => parseInt(v, 10) > max);
  return `assign trailfactor =
  if ${is('mtb:scale', tooHard)} then 10000
  else if and mtb:scale= ${is('sac_scale', SAC_TOO_HARD[level])} then 10000
  else 1`;
}

const FAST_SPEEDS = {
  off: [] as string[],
  '70': ['80', '90', '100', '110', '120', '130', 'rural'],
  '50': ['60', '70', '80', '90', '100', '110', '120', '130', 'rural'],
};

/**
 * Erzeugt ein vollständiges BRouter-Profil (.brf) aus den Einstellungen.
 * Aufbau orientiert sich an fastbike.brf; Zugangs- und Einbahnstraßen-Logik
 * ist von dort übernommen, die Kosten werden aus Straßen- × Belagsfaktor
 * berechnet.
 */
export function generateProfile(s: RoutingSettings): string {
  const sf = (k: keyof RoutingSettings['surface']) => num(PREF_FACTOR[s.surface[k]]);
  const rf = (k: keyof RoutingSettings['road']) => num(PREF_FACTOR[s.road[k]]);
  const hills = HILLS[s.hills];
  const fast = FAST_SPEEDS[s.speedLimit];
  const kin = KINEMATICS[s.bike ?? 'road'];

  const surfaceChain = `
assign surffactor =
  if ${is('surface', SURFACE_TAGS.asphalt)} then ${sf('asphalt')}
  else if ${is('surface', SURFACE_TAGS.concrete)} then ${sf('concrete')}
  else if ${is('surface', SURFACE_TAGS.paving)} then ${sf('paving')}
  else if ${is('surface', SURFACE_TAGS.cobble)} then ${sf('cobble')}
  else if ${is('surface', SURFACE_TAGS.compacted)} then ${sf('compacted')}
  else if ${is('surface', SURFACE_TAGS.gravel)} then ${sf('gravel')}
  else if ${is('surface', SURFACE_TAGS.unpaved)} then ${sf('unpaved')}
  else if surface= then (
    if tracktype=grade1 then ${sf('asphalt')}
    else if tracktype=grade2 then ${sf('compacted')}
    else if tracktype=grade3 then ${sf('gravel')}
    else if tracktype=grade4|grade5 then ${sf('unpaved')}
    else if ${is('highway', ASSUME_PAVED_HIGHWAYS)} then ${sf('asphalt')}
    else if ${is('smoothness', GOOD_SMOOTHNESS)} then ${sf('asphalt')}
    else ${sf('unknown')}
  )
  else ${sf('unknown')}
`;

  const roadChain = `
assign isdesignatedpath = and ${is('highway', DESIGNATED_PATHS)} bicycle=designated

assign roadfactor =
  if highway=motorway|motorway_link then 10000
  else if or highway=cycleway or bicycle_road=yes isdesignatedpath then ${rf('cycleway')}
  else if ${is('highway', ROAD_TAGS.primary)} then ${rf('primary')}
  else if ${is('highway', ROAD_TAGS.secondary)} then ${rf('secondary')}
  else if ${is('highway', ROAD_TAGS.tertiary)} then ${rf('tertiary')}
  else if ${is('highway', ROAD_TAGS.minor)} then ${rf('minor')}
  else if ${is('highway', ROAD_TAGS.residential)} then ${rf('residential')}
  else if highway=track then ${rf('track')}
  else if highway=steps then multiply 20 ${rf('path')}
  else if ${is('highway', ROAD_TAGS.path)} then ${rf('path')}
  else if route=ferry then ${s.allowFerries ? '5.67' : '10000'}
  else 10000
`;

  return `# Profil (${s.bike ?? 'road'}), generiert von Veloterra
---context:global

assign validForBikes = true

assign downhillcost   = 0
assign downhillcutoff = 1.5
assign uphillcost     = ${hills.uphillcost}
assign uphillcutoff   = ${hills.uphillcutoff}

assign totalMass  = ${kin.totalMass}
assign maxSpeed   = ${kin.maxSpeed}
assign S_C_x      = ${num(kin.S_C_x)}
assign C_r        = ${num(kin.C_r)}
assign bikerPower = ${kin.bikerPower}

assign turnInstructionMode          = 1
assign turnInstructionCatchingRange = 40
assign turnInstructionRoundabouts   = true
assign considerTurnRestrictions     = true
assign processUnusedTags            = false

---context:way

assign any_cycleroute
  or route_bicycle_icn=yes or route_bicycle_ncn=yes or route_bicycle_rcn=yes route_bicycle_lcn=yes

assign nodeaccessgranted or any_cycleroute lcn=yes

assign turncost = if junction=roundabout then 0 else 90

assign initialclassifier = if route=ferry then 1 else 0
assign initialcost switch route=ferry 10000 0

assign defaultaccess
       switch access=
              (
                    if motorroad=yes then false
                    else if highway=motorway|motorway_link then false
                    else true
              )
              switch or access=private access=no
                     false
                     true

assign bikeaccess =
       switch bicycle=
              switch bicycle_road=yes
                 true
                 switch vehicle=
                        ( if highway=footway then false else defaultaccess )
                        not vehicle=private|no
              not or bicycle=private or bicycle=no or bicycle=dismount bicycle=use_sidepath

assign footaccess =
       or bicycle=dismount
          switch foot=
                 defaultaccess
                 not or foot=private or foot=no foot=use_sidepath

assign accesspenalty
       switch bikeaccess
              0
              switch footaccess
                     5
                     switch any_cycleroute
                            15
                            switch bicycle=use_sidepath
                                   25
                                   10000

assign badoneway =
       if reversedirection=yes then
         if oneway:bicycle=yes then true
         else if oneway= then junction=roundabout
         else oneway=yes|true|1
       else oneway=-1

assign hascycleway = not
  and ( or cycleway= cycleway=no|none ) and ( or cycleway:left= cycleway:left=no ) and ( or cycleway:right= cycleway:right=no ) ( or cycleway:both= cycleway:both=no )

assign onewaypenalty =
       if ( badoneway ) then
       (
         if ( hascycleway ) then 0
         else if ( oneway:bicycle=no ) then 0
         else if ( not footaccess ) then 100
         else if ( junction=roundabout|circular ) then 60
         else if ( highway=primary|primary_link ) then 50
         else if ( highway=secondary|secondary_link ) then 30
         else if ( highway=tertiary|tertiary_link ) then 20
         else 6.0
       )
       else 0.0

assign consider_traffic = ${num(s.traffic)}
assign trafficpenalty =
      if not consider_traffic then 0
      else
      min switch hascycleway 0.3 100
      if   estimated_traffic_class=|1|2  then 0
      else if estimated_traffic_class=3 then multiply   0.3   consider_traffic
      else if estimated_traffic_class=4 then multiply   0.6   consider_traffic
      else if estimated_traffic_class=5 then multiply   0.9   consider_traffic
      else if estimated_traffic_class=6|7 then multiply 1.5   consider_traffic
      else 0

assign speedpenalty = ${fast.length ? `if and ${is('maxspeed', fast)} not hascycleway then 1.5 else 0` : '0'}

assign smoothfactor = ${
    s.avoidBadSmoothness
      ? `if ${is('smoothness', BAD_SMOOTHNESS)} then 3 else if smoothness=intermediate then 1.3 else 1`
      : '1'
  }

assign routebonus = ${s.preferCycleRoutes ? 'if any_cycleroute then 0.8 else 1' : '1'}
${surfaceChain}
${roadChain}
${trailChain(s.trailLevel ?? 'none')}

assign basefactor = multiply roadfactor multiply surffactor multiply smoothfactor trailfactor

assign costfactor =
  if greater basefactor 9998 then 10000
  else if greater accesspenalty 9998 then 10000
  else
    min 9999
    max 1
    add multiply basefactor routebonus
    add max onewaypenalty accesspenalty
    add trafficpenalty speedpenalty

assign priorityclassifier =
  if      ( highway=motorway                         ) then  30
  else if ( highway=motorway_link                    ) then  29
  else if ( highway=trunk                            ) then  28
  else if ( highway=trunk_link                       ) then  27
  else if ( highway=primary                          ) then  26
  else if ( highway=primary_link                     ) then  25
  else if ( highway=secondary                        ) then  24
  else if ( highway=secondary_link                   ) then  23
  else if ( highway=tertiary                         ) then  22
  else if ( highway=tertiary_link                    ) then  21
  else if ( highway=unclassified                     ) then  20
  else if ( highway=residential|living_street        ) then  6
  else if ( highway=service                          ) then  6
  else if ( highway=cycleway                         ) then  6
  else if ( or bicycle=designated bicycle_road=yes   ) then  6
  else if ( highway=track                            ) then if tracktype=grade1 then 6 else 4
  else if ( highway=bridleway|road|path|footway      ) then  4
  else if ( highway=steps                            ) then  2
  else if ( highway=pedestrian                       ) then  2
  else 0

assign isbadoneway = not equal onewaypenalty 0
assign isgoodoneway = if reversedirection=yes then oneway=-1
                      else if oneway= then junction=roundabout else oneway=yes|true|1
assign isroundabout = junction=roundabout
assign islinktype = highway=motorway_link|trunk_link|primary_link|secondary_link|tertiary_link
assign isgoodforcars = if greater priorityclassifier 6 then true
                  else if ( or highway=residential|living_street highway=service ) then true
                  else if ( and highway=track tracktype=grade1 ) then true
                  else false

assign classifiermask add          isbadoneway
                      add multiply isgoodoneway   2
                      add multiply isroundabout   4
                      add multiply islinktype     8
                          multiply isgoodforcars 16

# Tags für die Auswertung im Browser mit ausgeben
assign dummyUsage = or smoothness= or tracktype= or maxspeed= or bicycle= or mtb:scale= sac_scale=

---context:node

assign defaultaccess
       switch access=
              1
              switch or access=private access=no
                     0
                     1

assign bikeaccess
       or nodeaccessgranted=yes
          switch bicycle=
                 switch vehicle=
                        defaultaccess
                        switch or vehicle=private vehicle=no
                               0
                               1
                 switch or bicycle=private or bicycle=no bicycle=dismount
                        0
                        1

assign footaccess
       or bicycle=dismount
          switch foot=
                 defaultaccess
                 switch or foot=private foot=no
                        0
                        1

assign initialcost
    switch or highway=traffic_signals and highway=crossing crossing=traffic_signals 20
       switch bikeaccess
              0
              switch footaccess
                     300
                     1000000
`;
}
