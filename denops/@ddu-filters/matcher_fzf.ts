import {
  BaseFilter,
  DduItem,
  ItemHighlight,
  SourceOptions,
} from "https://deno.land/x/ddu_vim@v4.1.0/types.ts";
import { Denops } from "https://deno.land/x/ddu_vim@v4.1.0/deps.ts";
import { asyncExtendedMatch, AsyncFzf, FzfResultItem } from "https://esm.sh/fzf@0.5.2";

const HIGHLIGHT_NAME = "fzf_matched";

type Params = {
  highlightMatched: string;
};

const ENCODER = new TextEncoder();

function charposToBytepos(input: string, pos: number): number {
  return ENCODER.encode(input.slice(0, pos)).length;
}

export class Filter extends BaseFilter<Params> {
  async filter(args: {
    denops: Denops;
    sourceOptions: SourceOptions;
    input: string;
    items: DduItem[];
    filterParams: Params;
  }): Promise<DduItem[]> {
    const input = args.input;

    let fzf: AsyncFzf<ReadonlyArray<DduItem>>;
    if (input.length <= 3) {
      fzf = new AsyncFzf(args.items, {
        fuzzy: "v1",
        match: asyncExtendedMatch,
        selector: (item: DduItem) =>  item.matcherKey || item.word,
      });
    } else {
      fzf = new AsyncFzf(args.items, {
        fuzzy: "v2",
        match: asyncExtendedMatch,
        selector: (item: DduItem) =>  item.matcherKey || item.word,
      });
    }

    let items: FzfResultItem<DduItem>;
    try {
      items = await fzf.find(input);
    } catch {
      return [];
    }

    if (args.filterParams.highlightMatched === "") {
      return items.map((v: FzfResultItem<DduItem>) => v.item);
    }

    return items.map((v: FzfResultItem<DduItem>) => {
      if (v.start >= 0) {
        const target = v.item.matcherKey || v.item.word;
        const positions = [...v.positions].sort((a, b) => a - b);
        let { highlights = [] } = v.item;
        highlights = highlights.filter((hl: ItemHighlight) => hl.name !== HIGHLIGHT_NAME);
        let offset = 0;
        if (v.item.display !== undefined) {
          const offset_char = v.item.display.indexOf(target);
          offset = charposToBytepos(v.item.display, offset_char);
        }

        if (offset === -1) {
          return v.item;
        }

        let cur = positions.shift();

        while (cur !== undefined) {
          let len = 1;

          while (positions[0] === cur + len) {
            positions.shift();
            len++;
          }

          highlights.push({
            name: HIGHLIGHT_NAME,
            hl_group: args.filterParams.highlightMatched,
            col: offset + charposToBytepos(target, cur) + 1, // character position is 1-based
            width: len,
          });

          cur = positions.shift();
        }

        return {
          ...v.item,
          highlights,
          data: {
            ...(v.item.data || {}),
            fzfScore: v.score,
          },
        };
      } else {
        return v.item;
      }
    });
  }

  params(): Params {
    return {
      highlightMatched: "",
    };
  }
}
