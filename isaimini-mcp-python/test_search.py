"""Test: scrape tamil-dubbed and tamil-2023 categories, then search for 'jawan'"""
import asyncio
import importlib.util

spec = importlib.util.spec_from_file_location("server", "server.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

async def main():
    # First, scrape some categories that might have Jawan
    print("=== Scraping tamil-2023 (Jawan was a 2023 movie) ===")
    result = await mod.scrape_movies(category="tamil-2023", max_pages=5)
    print(result)
    
    print("\n=== Scraping tamil-dubbed ===")
    result = await mod.scrape_movies(category="tamil-dubbed", max_pages=3)
    print(result)

    print("\n=== Searching for 'jawan' ===")
    result = await mod.search_movie("jawan")
    print(result)

    print("\n=== Searching for 'Vikram' ===")
    result = await mod.search_movie("Vikram")
    print(result)

asyncio.run(main())
