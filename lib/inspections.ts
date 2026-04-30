// Inspection definitions shared with the web portal.
// Keys (e.g. "bld_permit_approved") MUST stay identical across web + mobile —
// they're the primary key for project_inspections rows in shared Supabase.
//
// Keep in sync with: nguyenmep-website/lib/inspections.js

export type InspectionStatus = 'not_yet' | 'partial' | 'failed' | 'passed'

export type StatusConfigEntry = {
  label: string
  color: string  // text / accent
  bg: string     // background tint
}

export const STATUS_CONFIG: Record<InspectionStatus, StatusConfigEntry> = {
  not_yet: { label: 'Not Yet',      color: '#1565C0', bg: '#E3F2FD' },
  partial: { label: 'Partial Pass', color: '#E65100', bg: '#FFF3E0' },
  failed:  { label: 'Failed',       color: '#B71C1C', bg: '#FDECEA' },
  passed:  { label: 'Passed',       color: '#2E7D32', bg: '#E8F5E9' },
}

export const STATUS_ORDER: InspectionStatus[] = ['not_yet', 'partial', 'failed', 'passed']

export type InspectionItem = { key: string; label: string }
export type InspectionSection = { phase: string; items: InspectionItem[] }
export type InspectionCategory = { category: string; icon: string; sections: InspectionSection[] }

export const COMMERCIAL_RESIDENTIAL_INSPECTIONS: InspectionCategory[] = [
  {
    category: 'Building',
    icon: '🏗',
    sections: [
      {
        phase: 'Pre-Construction',
        items: [
          { key: 'bld_permit_approved',     label: 'Permit issued / plans approved' },
          { key: 'bld_lot_survey',          label: 'Lot survey / setback verification' },
        ],
      },
      {
        phase: 'Foundation',
        items: [
          { key: 'bld_piers',               label: 'Piers inspection' },
          { key: 'bld_post_tension',        label: 'Post-tension cable / rebar inspection' },
          { key: 'bld_plumbing_under_slab', label: 'Plumbing rough under slab' },
          { key: 'bld_slab',                label: 'Slab inspection (pre-pour)' },
        ],
      },
      {
        phase: 'Framing',
        items: [
          { key: 'bld_rough_framing',       label: 'Rough framing inspection' },
          { key: 'bld_sheathing',           label: 'Sheathing / structural bracing' },
          { key: 'bld_steel_erection',      label: 'Structural steel erection' },
        ],
      },
      {
        phase: 'Dry-In',
        items: [
          { key: 'bld_roof_decking',        label: 'Roof decking / dried-in (felt, flashing)' },
        ],
      },
      {
        phase: 'Insulation',
        items: [
          { key: 'bld_insulation',          label: 'Insulation inspection' },
          { key: 'bld_energy_compliance',   label: 'Energy compliance (IECC)' },
        ],
      },
      {
        phase: 'Final',
        items: [
          { key: 'bld_drywall',             label: 'Drywall' },
          { key: 'bld_final_building',      label: 'Final building inspection' },
          { key: 'bld_co',                  label: 'Certificate of Occupancy (CO)' },
        ],
      },
    ],
  },
  {
    category: 'Electrical',
    icon: '⚡',
    sections: [
      {
        phase: 'Rough Stage',
        items: [
          { key: 'elec_underground', label: 'Underground electrical' },
          { key: 'elec_ufer',        label: 'UFER' },
          { key: 'elec_tpole',       label: 'Temporary power pole (T-pole)' },
          { key: 'elec_rough_in',    label: 'Rough-in electrical' },
        ],
      },
      {
        phase: 'Service Stage',
        items: [
          { key: 'elec_service', label: 'Service inspection (meter base, panel, grounding)' },
        ],
      },
      {
        phase: 'Final Stage',
        items: [
          { key: 'elec_final', label: 'Final electrical inspection' },
        ],
      },
    ],
  },
  {
    category: 'Plumbing',
    icon: '🔧',
    sections: [
      {
        phase: 'Underground',
        items: [
          { key: 'plmb_sewer_water',       label: 'Sewer / water service line inspection' },
          { key: 'plmb_rough_underground', label: 'Rough plumbing inspection (underground)' },
        ],
      },
      {
        phase: 'Rough-In',
        items: [
          { key: 'plmb_rough_in',   label: 'Rough plumbing inspection' },
          { key: 'plmb_top_out',    label: 'Top-out inspection' },
          { key: 'plmb_gas_line',   label: 'Gas line inspection' },
          { key: 'plmb_gas_release', label: 'Gas release inspection' },
        ],
      },
      {
        phase: 'Special Systems',
        items: [
          { key: 'plmb_grease_trap', label: 'Grease trap inspection' },
          { key: 'plmb_backflow',    label: 'Backflow prevention' },
        ],
      },
      {
        phase: 'Final',
        items: [
          { key: 'plmb_final', label: 'Final plumbing inspection' },
        ],
      },
    ],
  },
]

export const CIVIL_INSPECTIONS: InspectionCategory[] = [
  {
    category: 'Pre-Construction / Site Prep',
    icon: '📋',
    sections: [
      {
        phase: 'Before Moving Dirt',
        items: [
          { key: 'civ_permit',              label: 'Permit' },
          { key: 'civ_preconstruction_mtg', label: 'Pre-construction meeting' },
          { key: 'civ_tree_survey',         label: 'Tree survey / preservation' },
          { key: 'civ_swppp_setup',         label: 'SWPPP setup (erosion control)' },
        ],
      },
      {
        phase: 'Initial Inspections',
        items: [
          { key: 'civ_silt_fence',            label: 'Silt fence / inlet protection' },
          { key: 'civ_construction_entrance', label: 'Construction entrance (stabilized rock entry)' },
          { key: 'civ_clearing_limits',       label: 'Clearing & grubbing limits verification' },
        ],
      },
    ],
  },
  {
    category: 'Earthwork / Grading',
    icon: '🏔',
    sections: [
      {
        phase: 'Mass Grading',
        items: [
          { key: 'civ_rough_grading',       label: 'Rough grading inspection' },
          { key: 'civ_cut_fill',            label: 'Cut/fill verification' },
          { key: 'civ_pad_elevation',       label: 'Building pad elevation check' },
          { key: 'civ_compaction_3rd',      label: 'Compaction testing (3rd party)' },
          { key: 'civ_subgrade_compaction', label: 'Subgrade compaction' },
          { key: 'civ_select_fill',         label: 'Select fill / structural fill' },
          { key: 'civ_lime_stabilization',  label: 'Lime or cement stabilization' },
        ],
      },
    ],
  },
  {
    category: 'Underground Utilities',
    icon: '🔩',
    sections: [
      {
        phase: 'Water',
        items: [
          { key: 'civ_water_line',          label: 'Water line installation' },
          { key: 'civ_water_thrust_blocks', label: 'Thrust blocks (water)' },
          { key: 'civ_pressure_test',       label: 'Pressure test' },
          { key: 'civ_disinfection',        label: 'Disinfection (chlorination test)' },
        ],
      },
      {
        phase: 'Sanitary Sewer',
        items: [
          { key: 'civ_sewer_pipe',  label: 'Pipe installation' },
          { key: 'civ_manhole',     label: 'Manhole inspections' },
          { key: 'civ_air_test',    label: 'Air test / vacuum test' },
          { key: 'civ_mandrel_test', label: 'Mandrel test (PVC deflection)' },
        ],
      },
      {
        phase: 'Storm Drain',
        items: [
          { key: 'civ_storm_piping',          label: 'Storm piping installation' },
          { key: 'civ_inlets_jb',             label: 'Inlets, junction boxes' },
          { key: 'civ_detention_connections', label: 'Detention system connections' },
        ],
      },
      {
        phase: 'Fire Line',
        items: [
          { key: 'civ_fire_line',          label: 'Fire line installation' },
          { key: 'civ_fire_thrust_blocks', label: 'Thrust blocks (fire)' },
          { key: 'civ_fire_hydrostatic',   label: 'Hydrostatic pressure test (witnessed)' },
          { key: 'civ_fire_lead_in',       label: 'Lead-in to building' },
        ],
      },
    ],
  },
  {
    category: 'Stormwater / Drainage',
    icon: '💧',
    sections: [
      {
        phase: 'Civil Approval Critical',
        items: [
          { key: 'civ_detention_pond',        label: 'Detention pond excavation' },
          { key: 'civ_outlet_control',        label: 'Outlet control structures' },
          { key: 'civ_underground_detention', label: 'Underground detention systems (if used)' },
        ],
      },
      {
        phase: 'Water Quality',
        items: [
          { key: 'civ_oil_sand', label: 'Oil/sand separators' },
          { key: 'civ_wq_ponds', label: 'Water quality ponds' },
        ],
      },
      {
        phase: 'Final Drainage',
        items: [
          { key: 'civ_positive_drainage', label: 'Grading for positive drainage' },
          { key: 'civ_overflow_paths',    label: 'Overflow paths (no flooding toward buildings)' },
        ],
      },
    ],
  },
  {
    category: 'Paving / Flatwork',
    icon: '🛣',
    sections: [
      {
        phase: 'Subgrade',
        items: [
          { key: 'civ_proof_roll',            label: 'Proof roll inspection' },
          { key: 'civ_moisture_conditioning', label: 'Moisture conditioning' },
        ],
      },
      {
        phase: 'Base',
        items: [
          { key: 'civ_flex_base', label: 'Flex base placement + compaction test' },
        ],
      },
      {
        phase: 'Concrete Paving',
        items: [
          { key: 'civ_forms_rebar',    label: 'Forms and rebar' },
          { key: 'civ_ada_slopes',     label: 'ADA slopes (VERY strict)' },
          { key: 'civ_sidewalks_curb', label: 'Sidewalks, curb & gutter' },
        ],
      },
      {
        phase: 'Asphalt Paving',
        items: [
          { key: 'civ_lift_thickness',  label: 'Lift thickness' },
          { key: 'civ_temp_compaction', label: 'Temperature + compaction' },
        ],
      },
    ],
  },
  {
    category: 'Civil + Fire Department',
    icon: '🚒',
    sections: [
      {
        phase: 'Fire Access',
        items: [
          { key: 'civ_fire_lane_layout',     label: 'Fire lane layout (striping, signage)' },
          { key: 'civ_fire_lane_radius',     label: 'Fire lane turning radius' },
          { key: 'civ_fire_hydrant_spacing', label: 'Fire hydrant spacing and access' },
          { key: 'civ_fire_access_roads',    label: 'Fire department access roads' },
        ],
      },
    ],
  },
  {
    category: 'ADA / Accessibility (Site)',
    icon: '♿',
    sections: [
      {
        phase: 'Accessibility',
        items: [
          { key: 'civ_ada_parking',          label: 'Accessible parking spaces' },
          { key: 'civ_ada_aisles',           label: 'Access aisles slope (max 2%)' },
          { key: 'civ_sidewalk_cross_slope', label: 'Sidewalk cross slope' },
          { key: 'civ_ramps',                label: 'Ramps + detectable warnings' },
        ],
      },
    ],
  },
  {
    category: 'Landscaping / Irrigation',
    icon: '🌿',
    sections: [
      {
        phase: 'Landscaping',
        items: [
          { key: 'civ_irrigation',    label: 'Irrigation system (with backflow device)' },
          { key: 'civ_tree_planting', label: 'Tree planting compliance' },
          { key: 'civ_screening',     label: 'Screening (dumpsters, mechanical units)' },
        ],
      },
    ],
  },
  {
    category: 'Environmental / SWPPP',
    icon: '🌱',
    sections: [
      {
        phase: 'Environmental',
        items: [
          { key: 'civ_erosion_control',       label: 'Routine erosion control inspections' },
          { key: 'civ_stormwater_prevention', label: 'Stormwater pollution prevention compliance' },
          { key: 'civ_rain_inspections',      label: 'Inspections after rain events' },
        ],
      },
    ],
  },
  {
    category: 'Final Civil / Site',
    icon: '✅',
    sections: [
      {
        phase: 'Final',
        items: [
          { key: 'civ_final_grading',        label: 'Site grading complete' },
          { key: 'civ_parking_striping',     label: 'Parking lot + striping done' },
          { key: 'civ_utilities_accepted',   label: 'All utilities accepted by city' },
          { key: 'civ_no_standing_water',    label: 'No standing water / drainage issues' },
          { key: 'civ_fire_access_approved', label: 'Fire access approved' },
        ],
      },
    ],
  },
]

export function totalItems(list: InspectionCategory[]): number {
  return list.reduce(
    (sum, cat) => sum + cat.sections.reduce((s2, sec) => s2 + sec.items.length, 0),
    0
  )
}
