"""Еталон для .github/tests/ballistics.test.mjs: ті самі набої в py-ballisticcalc 3.1.1 (pip install py-ballisticcalc==3.1.1)."""
import json
import math
import sys
from pathlib import Path

import py_ballisticcalc as p
from py_ballisticcalc import Unit

# bc у lb/in², sh — см, zero — м; вага/довжина/діаметр і twist — лише для ФГС
CASES = [
    dict(name='M855 5.56 62gr', model='G7', bc=0.151, mv=915, sh=7, zero=100, tC=15, alt=0,
         max=700, step=50, gr=62, len_mm=23.0, dia_mm=5.69, twist=7),
    dict(name='M193 5.56 55gr G1', model='G1', bc=0.243, mv=990, sh=7, zero=100, tC=15, alt=0,
         max=500, step=50, gr=55, len_mm=18.8, dia_mm=5.69, twist=9),
    dict(name='.308 175 SMK', model='G7', bc=0.243, mv=790, sh=7, zero=100, tC=15, alt=0,
         max=700, step=50, gr=175, len_mm=31.2, dia_mm=7.82, twist=10),
    dict(name='6.5 CM 140 ELD-M, -10°C, 1000 м', model='G7', bc=0.326, mv=820, sh=5, zero=200,
         tC=-10, alt=1000, max=700, step=50, gr=140, len_mm=35.6, dia_mm=6.71, twist=8),
    dict(name='7.62x39 123gr G1, +30°C', model='G1', bc=0.275, mv=715, sh=8, zero=100, tC=30,
         alt=0, max=500, step=50, gr=123, len_mm=26.0, dia_mm=7.92, twist=9.45),
    # трансзвук: таблиці опору біля Mach 1 інакше не перевіряються
    dict(name='.300 BLK 125gr G7, трансзвук', model='G7', bc=0.172, mv=670, sh=7, zero=50,
         tC=15, alt=0, max=600, step=50, gr=125, len_mm=27.0, dia_mm=7.82, twist=8),
    dict(name='7.62x39 123gr G1 до 700 м, трансзвук', model='G1', bc=0.275, mv=715, sh=8,
         zero=100, tC=15, alt=0, max=700, step=50, gr=123, len_mm=26.0, dia_mm=7.92, twist=9.45),
]


def solve(c):
    dm = p.DragModel(c['bc'], p.TableG7 if c['model'] == 'G7' else p.TableG1,
                     weight=Unit.Grain(c['gr']), diameter=Unit.Millimeter(c['dia_mm']),
                     length=Unit.Millimeter(c['len_mm']))
    ammo = p.Ammo(dm, Unit.MPS(c['mv']))
    weapon = p.Weapon(sight_height=Unit.Centimeter(c['sh']), twist=Unit.Inch(c['twist']))
    atmo = p.Atmo.icao(altitude=Unit.Meter(c['alt']), temperature=Unit.Celsius(c['tC']),
                       humidity=0)
    calc = p.Calculator()
    shot = p.Shot(weapon=weapon, ammo=ammo, atmo=atmo)
    calc.set_weapon_zero(shot, Unit.Meter(c['zero']))
    still = calc.fire(shot, Unit.Meter(c['max']), Unit.Meter(c['step'])).samples
    windy_shot = p.Shot(weapon=weapon, ammo=ammo, atmo=atmo,
                        winds=[p.Wind(Unit.MPS(1), Unit.Degree(90))])
    windy = calc.fire(windy_shot, Unit.Meter(c['max']), Unit.Meter(c['step'])).samples
    rows = [r for r in still if r.distance >> Unit.Meter > 1]
    wrows = [r for r in windy if r.distance >> Unit.Meter > 1]
    # ФГС Міллера за стандартної атмосфери, як у застосунку (+15 °C, рівень моря)
    std = p.Shot(weapon=weapon, ammo=ammo, atmo=p.Atmo.icao(humidity=0))
    sg = p.ShotProps.from_shot(std).stability_coefficient
    return {
        **c,
        'X': [round(r.distance >> Unit.Meter, 3) for r in rows],
        # MRad, не Mil: Mil у py-ballisticcalc — натівський (6400 на коло)
        'H': [-(r.drop_angle >> Unit.MRad) for r in rows],
        # різниця з вітром і без — без деривації, як у застосунку
        'W': [abs((w.windage_angle >> Unit.MRad) - (r.windage_angle >> Unit.MRad))
              for r, w in zip(rows, wrows)],
        'T': [r.time for r in rows],
        'V': [r.velocity >> Unit.MPS for r in rows],
        'sg': sg,
    }


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name('ballistics-ref.json'))
    data = {'source': 'py-ballisticcalc 3.1.1', 'cases': [solve(c) for c in CASES]}
    assert all(math.isfinite(v) for c in data['cases'] for v in c['H'] + c['W'])
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{out}: {len(data["cases"])} набоїв')


if __name__ == '__main__':
    main()
