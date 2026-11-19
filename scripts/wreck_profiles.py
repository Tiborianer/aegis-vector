"""Authored releases in seconds. Each beat belongs to a physical assembly."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Beat:
    time: float
    label: str
    role: str
    size: float
    color: str = 'fire'
    side: str = 'hit'


# A beat's role is both the ignition site and the release time for that family of parts.
# Structure and other unlisted parts progressively follow the nearest failure.
PROFILES = {
    'player': (1.23, [
        Beat(.03, 'Struck wing root tears', 'skin', .21),
        Beat(.16, 'Cockpit collar releases', 'collar', .12, 'ion'),
        Beat(.31, 'Nacelle vents', 'drive', .24, 'ion'),
        Beat(.54, 'Center keel ruptures', 'core', .28),
    ]),
    'elite': (1.18, [Beat(.03,'Emitter seam','reactor',.25,'field'), Beat(.26,'Drive flare','drive',.22), Beat(.40,'Keel fracture','core',.25)]),
    'charger': (1.03, [Beat(.02,'Leading edge tears','skin',.25), Beat(.17,'Drive vents','drive',.24,'ion'), Beat(.32,'Spine snaps','core',.21)]),
    'bulwark': (1.49, [Beat(.02,'Armor detaches','skin',.20), Beat(.26,'Side pod ruptures','weapon',.24), Beat(.51,'Reactor fails','reactor',.27,'field'), Beat(.70,'Hull opens','core',.25)]),
    'phantom': (1.17, [Beat(.02,'Drive strike','drive',.21,'ion'), Beat(.24,'Dorsal blade sheds','weapon',.22), Beat(.42,'Spinal vent','core',.26)]),
    'artillery': (1.45, [Beat(.02,'Battery mount','weapon',.22), Beat(.27,'Capacitor arcs','reactor',.25,'field'), Beat(.53,'Magazine ignites','payload',.32), Beat(.69,'Chassis splits','core',.23)]),
    'skimmer': (1.24, [Beat(.03,'Crescent fracture','skin',.20), Beat(.23,'Exposed turbine vents','reactor',.25,'ion'), Beat(.42,'Command pod fails','core',.26)]),
    'weaver': (1.34, [Beat(.03,'Emitter drum breach','weapon',.24,'field'), Beat(.28,'Lobe bridge snaps','skin',.18), Beat(.53,'Spindle fails','core',.26)]),
    'prism': (1.30, [Beat(.03,'Lateral optic detaches','weapon',.23,'field'), Beat(.27,'Triangular spar shears','skin',.20), Beat(.49,'Optical nexus collapses','core',.29,'field')]),
    'leech': (1.34, [Beat(.02,'Mandible pivot tears','weapon',.22), Beat(.26,'Back armor lifts','skin',.22), Beat(.49,'Induction well vents','core',.30)]),
    'razorwing': (1.86,[Beat(.04,'Struck wing root','skin',.23),Beat(.37,'Near drive releases','drive',.26,'ion'),Beat(.71,'Opposite stabilizer peels','skin',.20,'fire','far'),Beat(.97,'Keel breaks','core',.33)]),
    'pursuer': (2.02,[Beat(.04,'Pursuit bank breach','skin',.22),Beat(.41,'Emitter flashes over','reactor',.27,'field'),Beat(.77,'Far drive breaks away','drive',.23,'ion','far'),Beat(1.12,'Center hull fails','core',.34)]),
    'warden': (2.26,[Beat(.04,'Near emitter ruptures','reactor',.22,'field'),Beat(.47,'Far emitter goes dark','reactor',.21,'field','far'),Beat(.83,'Field ring collapses','ring',.30,'field'),Beat(1.19,'Drive train breaks','drive',.23),Beat(1.39,'Keel opens','core',.32)]),
    'gatekeeper': (2.32,[Beat(.04,'Struck battery separates','weapon',.23),Beat(.46,'Deck peels from spar','skin',.25),Beat(.90,'Opposing engine bank tears loose','drive',.24,'ion','far'),Beat(1.29,'Bridge and spine split','core',.34)]),
    'carrierBoss': (2.62,[Beat(.04,'Outer hangar breach','skin',.20),Beat(.46,'Broadside battery ruptures','weapon',.24),Beat(.86,'Far hangar deck collapses','skin',.25,'fire','far'),Beat(1.23,'Engine bank vents','drive',.26,'ion'),Beat(1.58,'Bridge and keel separate','core',.36)]),
    'boss': (2.79,[Beat(.04,'Struck crescent tears','skin',.23),Beat(.51,'Gun deck fails','weapon',.24),Beat(.92,'Far crescent separates','skin',.24,'fire','far'),Beat(1.32,'Containment ring ruptures','reactor',.34),Beat(1.66,'Harrow spine splits','core',.38)]),
    'seraph': (2.44,[Beat(.04,'Bearing rupture','hinge',.17),Beat(.42,'Struck crescent opens','skin',.23),Beat(.82,'Opposite lance and wing detach','weapon',.24,'ion','far'),Beat(1.15,'Reactor containment fails','reactor',.29,'field'),Beat(1.47,'Citadel separates','core',.34)]),
    'nullArchitect': (2.82,[Beat(.04,'Struck outrigger tears','tip',.20),Beat(.49,'Ribs unzip','skin',.21),Beat(.94,'Opposite outriggers let go','tip',.22,'fire','far'),Beat(1.33,'Drive spine cracks','drive',.24,'ion'),Beat(1.70,'Reactor opens the keel','reactor',.37)]),
}
