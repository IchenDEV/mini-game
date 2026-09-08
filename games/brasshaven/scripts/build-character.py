"""Handcrafted voxel mechanic. Run: Blender --background --python scripts/build-character.py
Optional: -- --preview /tmp/mechanic.png (studio render, never included in GLB).
Blender +Z up/-Y forward exports to glTF +Y up/+Z forward. No external assets.
"""
import bpy
import math
import sys
import json
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'mechanic.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, metallic=0, roughness=.5, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return mat

LEATHER = material('Oiled warm brown leather', (.125, .050, .022), 0, .49)
DARK = material('Dark leather seams and soles', (.028, .016, .012), 0, .68)
BRASS = material('Worn golden brass', (.48, .265, .075), .82, .32)
IRON = material('Blued gunmetal', (.043, .062, .066), .78, .38)
CYAN = material('Cyan luminous crystal', (.015, .66, .79), .22, .2, 3)
SKIN = material('Warm weathered face', (.38, .205, .105), 0, .82)
IVORY = material('Gauge enamel', (.72, .66, .43), .1, .5)
parts = {}
roots = {}


def root(name, loc):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.empty_display_size = .08
    parts[name] = []
    roots[name] = obj
    return name


def finish(obj, group, mat, bevel=.003):
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Fine machined edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    parts[group].append(obj)
    return obj


def box(group, name, loc, size, mat, bevel=.003, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rotation:
        obj.rotation_euler = rotation
    return finish(obj, group, mat, bevel)


def cylinder(group, name, loc, radius, depth, mat, axis='Z', vertices=12, bevel=.002):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    if axis == 'Y':
        obj.rotation_euler.x = math.pi / 2
    elif axis == 'X':
        obj.rotation_euler.y = math.pi / 2
    return finish(obj, group, mat, bevel)


def bar(group, name, a, b, radius, mat, vertices=8):
    a, b = Vector(a), Vector(b)
    obj = cylinder(group, name, (a+b)/2, radius, (b-a).length, mat, vertices=vertices)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj


def rivet(group, loc, axis='Y', radius=.009):
    return cylinder(group, 'Brass fastener', loc, radius, .009, BRASS, axis, 8, .001)


body = root('Body', (0, 0, .94))
head = root('Head', (0, 0, 1.36))
# Fitted long coat with a split hem, raised lapels, cuffs, and waist belt.
box(body, 'Coat chest', (0, 0, 1.075), (.49, .31, .47), LEATHER, .008)
box(body, 'Coat lower body', (0, .015, .78), (.47, .32, .22), LEATHER, .006)
for side in [-1, 1]:
    box(body, 'Split coat skirt', (side*.146, .045, .565), (.267, .36, .35), LEATHER, .006,
        (0, side*-.07, 0))
    box(body, 'Hem binding', (side*.157, -.14, .405), (.245, .018, .027), DARK)
    box(body, 'Raised angular lapel', (side*.098, -.171, 1.19), (.091, .03, .235), DARK,
        rotation=(0, side*-.23, 0))
    box(body, 'Backpack harness', (side*.179, -.17, 1.105), (.044, .023, .365), DARK)
    box(body, 'Harness brass clasp', (side*.179, -.19, 1.20), (.057, .018, .062), BRASS)
    box(body, 'Clasp leather inset', (side*.179, -.202, 1.20), (.031, .008, .035), DARK)
    box(body, 'Coat patch pocket', (side*.17, -.16, .665), (.115, .035, .145), DARK)
    box(body, 'Pocket flap', (side*.17, -.183, .731), (.129, .024, .036), LEATHER)
    rivet(body, (side*.17, -.20, .73))
box(body, 'Shirt inset', (0, -.159, 1.205), (.085, .018, .20), IRON)
box(body, 'Standing collar', (0, .012, 1.322), (.29, .27, .075), DARK)
for z in [.99, 1.065, 1.14]:
    rivet(body, (.025, -.175, z), radius=.010)
box(body, 'Tool belt', (0, -.006, .855), (.52, .35, .092), DARK)
box(body, 'Belt buckle', (0, -.192, .855), (.104, .025, .076), BRASS)
box(body, 'Buckle opening', (0, -.21, .855), (.070, .009, .045), DARK)
box(body, 'Buckle tongue', (0, -.218, .855), (.012, .01, .056), BRASS)
for x in [-.20, -.145, .145, .20]:
    rivet(body, (x, -.188, .855), radius=.006)
box(body, 'Belt satchel', (.286, -.015, .802), (.095, .18, .17), LEATHER)
box(body, 'Satchel flap', (.30, -.018, .882), (.10, .193, .044), DARK)
# Visible wrench holstered at the other hip.
box(body, 'Wrench handle', (-.278, -.083, .765), (.031, .038, .19), IRON)
box(body, 'Wrench open jaw base', (-.278, -.083, .871), (.087, .043, .027), IRON)
for x in [-.312, -.244]:
    box(body, 'Wrench jaw', (x, -.083, .903), (.022, .043, .064), IRON)
box(body, 'Tool retaining loop', (-.285, -.11, .793), (.066, .031, .032), BRASS)

# Brass boiler backpack: dark case, golden rails, octagonal pressure vessel.
box(body, 'Backpack dark case', (0, .274, 1.09), (.405, .225, .40), DARK, .008)
box(body, 'Backpack brass faceplate', (0, .396, 1.09), (.35, .035, .345), BRASS, .006)
box(body, 'Backpack inset panel', (0, .418, 1.085), (.292, .015, .276), IRON)
for x in [-.18, .18]:
    box(body, 'Vertical brass cage rail', (x, .396, 1.09), (.038, .058, .435), BRASS)
    for z in [.905, 1.275]:
        rivet(body, (x, .431, z), radius=.014)
for z in [.895, 1.285]:
    box(body, 'Cage crossbar', (0, .399, z), (.38, .055, .035), BRASS)
cylinder(body, 'Boiler tank', (-.098, .294, 1.16), .076, .47, BRASS, vertices=8)
for z in [.965, 1.17, 1.36]:
    cylinder(body, 'Boiler retaining band', (-.098, .294, z), .082, .025, IRON, vertices=8)
# Gauge is on the back, readable above the central vent.
cylinder(body, 'Pressure gauge brass bezel', (.035, .446, 1.19), .089, .042, BRASS, 'Y', 16)
cylinder(body, 'Pressure gauge black inner rim', (.035, .472, 1.19), .074, .014, DARK, 'Y', 16)
cylinder(body, 'Pressure gauge ivory dial', (.035, .482, 1.19), .063, .008, IVORY, 'Y', 16, 0)
for angle in [-120, -80, -40, 0, 40, 80, 120]:
    a = math.radians(angle)
    x, z = .035 + math.sin(a)*.051, 1.19 + math.cos(a)*.051
    box(body, 'Dial tick', (x, .489, z), (.005, .003, .012), IRON, 0, (0, a, 0))
bar(body, 'Gauge needle', (.035, .491, 1.19), (.008, .491, 1.224), .0035, IRON, 6)
rivet(body, (.035, .495, 1.19), radius=.007)
for z in [1.005, 1.037, 1.069]:
    box(body, 'Backpack ventilation louver', (.015, .435, z), (.115, .023, .012), BRASS)
# Small elbow pipes and knurled union collars.
for x, top in [(.218, 1.405), (-.222, 1.32)]:
    bar(body, 'External riser', (x, .32, .98), (x, .32, top), .019, BRASS)
    bar(body, 'Top pipe elbow', (x, .32, top), (x*.57, .32, top), .019, BRASS)
    box(body, 'Squared elbow', (x, .32, top), (.042, .042, .042), BRASS)
    for z in [1.035, top-.065]:
        cylinder(body, 'Pipe union nut', (x, .32, z), .027, .026, IRON, vertices=8)
bar(body, 'Bottom return pipe', (-.20, .35, .945), (.18, .35, .945), .019, BRASS)
# Small mechanical valve on the rear panel.
cylinder(body, 'Valve hub', (-.102, .453, 1.052), .040, .033, BRASS, 'Y', 8)
for angle in [0, math.pi/2]:
    bar(body, 'Valve handle', (-.102-.045*math.cos(angle), .48, 1.052-.045*math.sin(angle)),
        (-.102+.045*math.cos(angle), .48, 1.052+.045*math.sin(angle)), .008, IRON)

# Squared head, sculpted block nose and jaw; cap brim over paired cyan goggles.
box(head, 'Neck', (0, 0, 1.37), (.18, .19, .09), SKIN)
box(head, 'Square head', (0, -.013, 1.502), (.334, .298, .272), SKIN, .009)
box(head, 'Back leather hood', (0, .132, 1.513), (.34, .046, .255), DARK)
box(head, 'Jaw scarf', (0, -.041, 1.386), (.34, .278, .068), DARK)
box(head, 'Block nose', (0, -.19, 1.461), (.052, .069, .067), SKIN)
box(head, 'Moustache left', (-.032, -.174, 1.421), (.065, .026, .023), DARK)
box(head, 'Moustache right', (.032, -.174, 1.421), (.065, .026, .023), DARK)
box(head, 'Goggle strap', (0, -.011, 1.541), (.356, .315, .059), DARK)
for x in [-.094, .094]:
    cylinder(head, 'Goggle brass housing', (x, -.190, 1.542), .086, .061, BRASS, 'Y', 12)
    cylinder(head, 'Goggle dark gasket', (x, -.225, 1.542), .072, .017, IRON, 'Y', 12)
    cylinder(head, 'Luminous cyan lens', (x, -.237, 1.542), .057, .014, CYAN, 'Y', 12)
    for dx, dz in [(-.066, 0), (.066, 0), (0, .066), (0, -.066)]:
        rivet(head, (x+dx, -.238, 1.542+dz), radius=.006)
box(head, 'Goggle bridge', (0, -.218, 1.548), (.039, .030, .021), BRASS)
box(head, 'Square hat brim', (0, -.022, 1.673), (.49, .424, .061), DARK, .005)
box(head, 'Leather hat crown', (0, .006, 1.747), (.383, .326, .132), LEATHER, .007)
box(head, 'Hat ribbon', (0, .006, 1.7), (.392, .335, .041), DARK)
box(head, 'Hat top inset', (0, .006, 1.813), (.338, .285, .011), LEATHER)
box(head, 'Hat brass insignia', (.101, -.170, 1.713), (.047, .015, .039), BRASS)
for x in [-.159, .159]:
    for y in [-.126, .135]:
        rivet(head, (x, y, 1.817), 'Z', .007)

for name, side in [('LeftLeg', 1), ('RightLeg', -1)]:
    group = root(name, (side*.132, 0, .72))
    box(group, 'Trouser leg', (side*.132, .005, .425), (.179, .21, .52), DARK, .005)
    box(group, 'Boot shaft', (side*.132, .006, .225), (.198, .233, .28), LEATHER, .006)
    box(group, 'Heavy squared boot', (side*.132, -.066, .099), (.216, .356, .146), DARK, .006)
    box(group, 'Boot sole', (side*.132, -.062, .022), (.226, .37, .044), DARK, .002)
    box(group, 'Boot toe guard', (side*.132, -.204, .104), (.209, .063, .085), IRON)
    box(group, 'Boot ankle strap', (side*.132, -.002, .257), (.212, .246, .033), DARK)
    box(group, 'Boot side buckle', (side*.236, -.025, .257), (.018, .062, .043), BRASS)

for name, side in [('LeftArm', 1), ('RightArm', -1)]:
    group = root(name, (side*.322, 0, 1.25))
    box(group, 'Coat shoulder', (side*.325, 0, 1.222), (.18, .26, .183), LEATHER, .007)
    box(group, 'Coat sleeve', (side*.377, -.005, 1.061), (.156, .218, .287), LEATHER, .006,
        (0, side*-.16, 0))
    box(group, 'Raised cuff', (side*.403, -.013, .941), (.172, .238, .066), DARK)
    box(group, 'Leather glove', (side*.409, -.022, .851), (.153, .173, .14), DARK, .006)
    box(group, 'Glove thumb', (side*.345, -.067, .865), (.043, .093, .081), DARK)
    box(group, 'Brass cuff clasp', (side*.405, -.14, .946), (.043, .013, .037), BRASS)
    for z in [.832, .857]:
        box(group, 'Glove knuckle seam', (side*.413, -.113, z), (.103, .012, .006), LEATHER, .001)
    if name == 'RightArm':
        # Handle connects through the grip; lantern moves with the entire arm.
        lx, ly = side*.427, -.092
        for dx in [-.052, .052]:
            bar(group, 'Lantern handle side', (lx+dx, ly, .675), (lx+dx, ly, .824), .008, BRASS)
        bar(group, 'Lantern grip', (lx-.052, ly, .824), (lx+.052, ly, .824), .010, BRASS)
        box(group, 'Lantern roof', (lx, ly, .674), (.166, .162, .032), IRON)
        box(group, 'Lantern crown', (lx, ly, .697), (.096, .094, .021), BRASS)
        box(group, 'Lantern foot', (lx, ly, .456), (.169, .167, .036), IRON)
        box(group, 'Cyan lantern crystal', (lx, ly, .567), (.101, .100, .176), CYAN, .003)
        for dx in [-.069, .069]:
            for dy in [-.068, .068]:
                box(group, 'Lantern corner cage', (lx+dx, ly+dy, .565), (.014, .014, .19), BRASS, .001)
        for z in [.49, .641]:
            box(group, 'Lantern front rim', (lx, ly-.074, z), (.148, .012, .018), BRASS)
            box(group, 'Lantern rear rim', (lx, ly+.074, z), (.148, .012, .018), BRASS)

# Join each animated group. glTF emits one primitive per material, not per detail.
for name, objects in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name + 'Mesh'
    world = obj.matrix_world.copy()
    obj.parent = roots[name]
    obj.matrix_world = world
    # Keep local axes aligned with world so Three rotation.x swings limbs.
    bpy.context.scene.cursor.location = roots[name].location
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    obj['part'] = name

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format='GLB', use_selection=True,
    export_yup=True, export_animations=False, export_cameras=False, export_lights=False,
    export_materials='EXPORT', export_extras=True)
# Assert the actual exported node/primitive/bounds contract, using stdlib only.
raw = OUTPUT.read_bytes()
assert raw[:4] == b'glTF'
length, kind = struct.unpack_from('<II', raw, 12)
doc = json.loads(raw[20:20+length])
nodes = {n['name']: n for n in doc['nodes']}
for name in roots:
    assert name in nodes, name
for name in ['LeftLeg', 'RightLeg', 'LeftArm', 'RightArm']:
    expected = .72 if 'Leg' in name else 1.25
    assert abs(nodes[name]['translation'][1] - expected) < .00001, nodes[name]
primitives = sum(len(m['primitives']) for m in doc['meshes'])
assert primitives < 35, primitives
assert not doc.get('textures'), 'Expected texture-free PBR materials'
print(f'VALIDATED {OUTPUT}: {len(raw):,} bytes, {primitives} draw calls, {len(doc["materials"])} PBR materials')

if '--preview' in sys.argv:
    preview = sys.argv[sys.argv.index('--preview') + 1]
    # Render a fresh import to catch coordinate or parenting errors in the delivered GLB.
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(OUTPUT))
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(v) for obj in bpy.context.scene.objects
              if obj.type == 'MESH' for v in obj.bound_box]
    low, high = min(v.z for v in points), max(v.z for v in points)
    assert abs(low) < .001 and 1.79 < high < 1.85, (low, high)
    print(f'REIMPORTED feet={low:.4f}, height={high-low:.4f}')
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.world.color = (.16, .16, .16)
    floor = material('Preview ground', (.025, .034, .04), .05, .7)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.002))
    bpy.context.object.data.materials.append(floor)
    bpy.ops.object.camera_add(location=(-2.7, -4.3, 2.5))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, .03, .91))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.35
    scene.camera = camera
    def light(loc, color, power, size):
        bpy.ops.object.light_add(type='AREA', location=loc)
        obj = bpy.context.object
        obj.data.energy, obj.data.color, obj.data.shape, obj.data.size = power, color, 'DISK', size
        obj.rotation_euler = (Vector((0, 0, 1))-obj.location).to_track_quat('-Z', 'Y').to_euler()
    light((-3, -4, 5), (1, .78, .54), 480, 3)
    light((3, -1, 3), (.49, .76, 1), 350, 3)
    light((1, 3, 4), (1, .62, .27), 650, 2)
    scene.render.filepath = preview
    bpy.ops.render.render(write_still=True)
    camera.location = (-2.7, 4.3, 2.5)
    camera.rotation_euler = (Vector((0, .03, .91))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(Path(preview).with_stem(Path(preview).stem + '-back'))
    bpy.ops.render.render(write_still=True)
