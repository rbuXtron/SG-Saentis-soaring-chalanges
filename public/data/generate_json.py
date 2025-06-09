#!/usr/bin/env python3
"""
SG Säntis Cup - Historical Badge Data Generator
Erstellt JSON-Datei mit historischen Multi-Level Badge Punkten
Nutzt die WeGlide Badge API zur automatischen Erkennung von Multi-Level Badges
"""

import json
import requests
from datetime import datetime
from typing import Dict, List, Set, Optional
import time

# Konfiguration
WEGLIDE_API_BASE = "https://api.weglide.org/v1"
CLUB_ID = 1281  # SG Säntis
SEASON_END_DATE = "2024-09-30"  # Ende der letzten Saison

class WeGlideHistoricalBadgeExporter:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Accept': 'application/json',
            'User-Agent': 'SG-Saentis-Badge-Exporter/1.0'
        })
        self.multi_level_badge_ids = set()
        self.badge_definitions = {}
        
    def fetch_all_badges(self) -> Dict[str, Dict]:
        """Lädt alle Badge-Definitionen und identifiziert Multi-Level Badges"""
        print("Lade Badge-Definitionen von WeGlide...")
        
        try:
            response = self.session.get(f"{WEGLIDE_API_BASE}/badge")
            response.raise_for_status()
            badges = response.json()
            
            # Verarbeite Badge-Definitionen
            for badge in badges:
                badge_id = badge.get('id', '')
                points = badge.get('points', [])
                
                # Badge-Definition speichern
                self.badge_definitions[badge_id] = {
                    'name': badge.get('name', badge_id),
                    'description': badge.get('description', ''),
                    'points': points,
                    'values': badge.get('values', []),
                    'unit': badge.get('unit', '')
                }
                
                # Multi-Level Badge wenn points Array mit mehr als einem Wert
                if isinstance(points, list) and len(points) > 1:
                    self.multi_level_badge_ids.add(badge_id)
                    print(f"  ✅ Multi-Level Badge gefunden: {badge_id} ({len(points)} Level)")
            
            print(f"\n📊 Badge-Statistiken:")
            print(f"  - Badges gesamt: {len(badges)}")
            print(f"  - Multi-Level Badges: {len(self.multi_level_badge_ids)}")
            print(f"  - Single-Level Badges: {len(badges) - len(self.multi_level_badge_ids)}")
            
            # Zeige alle Multi-Level Badges
            print(f"\n🏅 Gefundene Multi-Level Badges:")
            for badge_id in sorted(self.multi_level_badge_ids):
                badge_def = self.badge_definitions[badge_id]
                print(f"  - {badge_id}: {badge_def['name']} ({len(badge_def['points'])} Level)")
            
            return self.badge_definitions
            
        except Exception as e:
            print(f"❌ Fehler beim Laden der Badge-Definitionen: {e}")
            return {}
    
    def fetch_club_members(self) -> List[Dict]:
        """Lädt alle Mitglieder des Clubs"""
        print(f"\nLade Club-Mitglieder für Club ID {CLUB_ID}...")
        
        try:
            response = self.session.get(f"{WEGLIDE_API_BASE}/club/{CLUB_ID}")
            response.raise_for_status()
            data = response.json()
            
            members = data.get('user', [])
            print(f"✅ {len(members)} Mitglieder gefunden")
            return members
        
        except Exception as e:
            print(f"❌ Fehler beim Laden der Club-Daten: {e}")
            return []
    
    def fetch_user_achievements(self, user_id: int) -> List[Dict]:
        """Lädt alle Achievements eines Users"""
        try:
            response = self.session.get(f"{WEGLIDE_API_BASE}/achievement/user/{user_id}")
            response.raise_for_status()
            achievements = response.json()
            
            if isinstance(achievements, list):
                return achievements
            else:
                return []
                
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                # User hat keine Achievements
                return []
            else:
                print(f"  ⚠️ HTTP Fehler bei User {user_id}: {e}")
                return []
        except Exception as e:
            print(f"  ⚠️ Fehler bei User {user_id}: {e}")
            return []
    
    def calculate_badge_points_for_level(self, badge_id: str, achieved_value: float) -> int:
        """
        Berechnet die Gesamtpunkte für einen erreichten Wert
        basierend auf der Badge-Definition
        """
        badge_def = self.badge_definitions.get(badge_id, {})
        points_array = badge_def.get('points', [])
        values_array = badge_def.get('values', [])
        
        if not values_array or not points_array:
            return 0
        
        total_points = 0
        
        # Finde alle erreichten Level
        for i, threshold in enumerate(values_array):
            if achieved_value >= threshold and i < len(points_array):
                total_points += points_array[i]
            else:
                break
        
        return total_points
    
    def filter_historical_badges(self, achievements: List[Dict]) -> Dict[str, Dict]:
        """
        Filtert Multi-Level Badges und gibt die höchsten erreichten Werte
        bis zum Ende der letzten Saison zurück
        """
        historical_badges = {}
        season_end = datetime.strptime(SEASON_END_DATE, "%Y-%m-%d")
        
        for achievement in achievements:
            badge_id = achievement.get('badge_id', '')
            created_date = achievement.get('created', '')
            value = achievement.get('value', 0)
            points = achievement.get('points', 0)
            
            # Prüfe ob Multi-Level Badge
            if badge_id not in self.multi_level_badge_ids:
                continue
            
            # Prüfe ob vor Saisonende
            try:
                badge_date = datetime.strptime(created_date[:10], "%Y-%m-%d")
                if badge_date > season_end:
                    continue
            except:
                continue
            
            # Speichere höchsten Wert und zugehörige Punkte
            if badge_id not in historical_badges or value > historical_badges[badge_id]['value']:
                # Berechne Punkte basierend auf Badge-Definition
                calculated_points = self.calculate_badge_points_for_level(badge_id, value)
                
                historical_badges[badge_id] = {
                    'value': value,
                    'points': calculated_points,
                    'achievement_points': points,  # Original-Punkte vom Achievement
                    'date': created_date[:10]
                }
        
        return historical_badges
    
    def generate_historical_data(self) -> Dict:
        """Generiert die komplette historische Badge-Datenstruktur"""
        
        # Lade zuerst alle Badge-Definitionen
        badges = self.fetch_all_badges()
        if not badges:
            print("❌ Keine Badge-Definitionen gefunden!")
            return None
        
        # Lade Club-Mitglieder
        members = self.fetch_club_members()
        if not members:
            return None
        
        historical_data = {
            "metadata": {
                "season": "2023/2024",
                "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
                "description": "Höchste erreichte Multi-Level Badge Punkte bis Ende Saison 2023/2024",
                "clubId": CLUB_ID,
                "clubName": "SG Säntis",
                "multiLevelBadgeCount": len(self.multi_level_badge_ids),
                "multiLevelBadges": sorted(list(self.multi_level_badge_ids))
            },
            "pilots": {},  # NEU: Struktur mit Namen und Badges
            "badgeDefinitions": {}  # Speichere auch die Badge-Definitionen
        }
        
        # Speichere Badge-Definitionen (nur Multi-Level)
        for badge_id in self.multi_level_badge_ids:
            historical_data["badgeDefinitions"][badge_id] = self.badge_definitions[badge_id]
        
        print(f"\nVerarbeite {len(members)} Mitglieder...")
        print("=" * 60)
        
        processed = 0
        pilots_with_badges = 0
        
        for idx, member in enumerate(members, 1):
            user_id = member.get('id')
            user_name = member.get('name', 'Unknown')
            
            print(f"\n[{idx}/{len(members)}] {user_name} (ID: {user_id})")
            
            # Lade Achievements
            achievements = self.fetch_user_achievements(user_id)
            
            if not achievements:
                print(f"  → Keine Achievements gefunden")
                continue
            
            # Filtere historische Multi-Level Badges
            historical_badges = self.filter_historical_badges(achievements)
            
            if historical_badges:
                # Speichere nur die Punkte
                user_badges = {}
                for badge_id, badge_data in historical_badges.items():
                    user_badges[badge_id] = badge_data['points']
                
                # NEU: Speichere mit Namen
                historical_data["pilots"][str(user_id)] = {
                    "name": user_name,
                    "badges": user_badges
                }
                pilots_with_badges += 1
                
                print(f"  ✅ {len(historical_badges)} Multi-Level Badges gefunden:")
                for badge_id, data in sorted(historical_badges.items()):
                    badge_name = self.badge_definitions[badge_id]['name']
                    print(f"     - {badge_id} ({badge_name}): {data['points']} Punkte (Wert: {data['value']})")
            else:
                print(f"  → Keine historischen Multi-Level Badges")
            
            processed += 1
            
            # Rate limiting
            time.sleep(0.3)  # 300ms Pause zwischen Requests
        
        print("\n" + "=" * 60)
        print(f"✅ Verarbeitung abgeschlossen!")
        print(f"   - Mitglieder verarbeitet: {processed}")
        print(f"   - Mitglieder mit Badges: {pilots_with_badges}")
        
        return historical_data
    
    def save_to_file(self, data: Dict, filename: str = None):
        """Speichert die Daten in eine JSON-Datei"""
        if filename is None:
            filename = f"historical-badges-{datetime.now().strftime('%Y')}.json"
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Daten gespeichert in: {filename}")
        
        # Statistiken ausgeben
        total_badges = sum(len(pilot['badges']) for pilot in data['pilots'].values())
        print(f"\n📊 Statistiken:")
        print(f"   - Piloten mit Badges: {len(data['pilots'])}")
        print(f"   - Badges gesamt: {total_badges}")
        if data['pilots']:
            print(f"   - Durchschnitt pro Pilot: {total_badges/len(data['pilots']):.1f}")
        
        # Zeige Badge-Verteilung
        badge_counts = {}
        for pilot_data in data['pilots'].values():
            for badge_id in pilot_data['badges']:
                badge_counts[badge_id] = badge_counts.get(badge_id, 0) + 1
        
        print(f"\n🎯 Badge-Verteilung:")
        for badge_id, count in sorted(badge_counts.items(), key=lambda x: x[1], reverse=True):
            badge_name = data['badgeDefinitions'][badge_id]['name']
            print(f"   - {badge_id} ({badge_name}): {count} Piloten")
        
        # NEU: Zeige Piloten alphabetisch
        print(f"\n👥 Piloten mit Badges (alphabetisch):")
        sorted_pilots = sorted(data['pilots'].items(), key=lambda x: x[1]['name'])
        for user_id, pilot_data in sorted_pilots[:10]:  # Erste 10 zeigen
            print(f"   - {pilot_data['name']} (ID: {user_id}): {len(pilot_data['badges'])} Badges")
        if len(sorted_pilots) > 10:
            print(f"   ... und {len(sorted_pilots) - 10} weitere Piloten")

def main():
    """Hauptfunktion"""
    print("🏅 SG Säntis Historical Badge Data Generator")
    print("=" * 60)
    
    exporter = WeGlideHistoricalBadgeExporter()
    
    # Generiere historische Daten
    historical_data = exporter.generate_historical_data()
    
    if historical_data:
        # Speichere in Datei
        exporter.save_to_file(historical_data)
        
        # Optional: Zeige Beispieldaten
        print("\n📄 Beispiel der generierten Daten:")
        print("-" * 40)
        
        # Zeige ersten Piloten als Beispiel
        if historical_data['pilots']:
            first_user_id = list(historical_data['pilots'].keys())[0]
            pilot_data = historical_data['pilots'][first_user_id]
            
            print(f"\nUser ID: {first_user_id}")
            print(f"Name: {pilot_data['name']}")
            print("Badges:")
            for badge_id, points in pilot_data['badges'].items():
                badge_name = historical_data['badgeDefinitions'][badge_id]['name']
                print(f"  - {badge_id} ({badge_name}): {points} Punkte")

if __name__ == "__main__":
    main()