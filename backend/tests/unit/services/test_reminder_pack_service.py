"""Unit tests for reminder pack loading."""

import pytest

from app.services.reminder_pack_service import get_pack, list_packs


@pytest.mark.unit
class TestReminderPackService:
    def test_list_packs_includes_builtins(self):
        packs = list_packs()
        ids = {p.id for p in packs}
        assert "oil_and_filter" in ids
        assert "tire_rotation" in ids
        assert "boat_winterization" in ids
        assert "atv_utv_service" in ids
        assert "snowmobile_season" in ids
        assert "diy_oil_change" not in ids

    def test_list_packs_filters_by_vehicle_type(self):
        boat_packs = list_packs(vehicle_type="Boat")
        boat_ids = {p.id for p in boat_packs}
        assert "boat_winterization" in boat_ids
        assert "oil_and_filter" not in boat_ids

        car_packs = list_packs(vehicle_type="Car")
        car_ids = {p.id for p in car_packs}
        assert "oil_and_filter" in car_ids
        assert "boat_winterization" not in car_ids
        assert "atv_utv_service" not in car_ids

    def test_get_pack_oil_and_filter(self):
        pack = get_pack("oil_and_filter")
        assert pack.name
        assert len(pack.reminders) >= 1
        assert pack.reminders[0].title == "Oil & Filter Change"
        assert pack.reminders[0].due_date_offset_days == 180
        assert "Car" in pack.vehicle_types
        assert any(r.title == "Inspect Drain Plug Washer" for r in pack.reminders)
