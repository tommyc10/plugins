#!/usr/bin/env ruby
# Validate the files agents load without requiring a package installation.
require 'yaml'
require 'json'
require 'pathname'
require 'uri'

root = Pathname.new(ARGV.fetch(0, File.expand_path('..', __dir__))).expand_path
errors = []
names = {}
skills = Dir[root.join('skills/*/SKILL.md').to_s].sort
errors << 'No skills found' if skills.empty?

skills.each do |file|
  path = Pathname.new(file)
  relative = path.relative_path_from(root)
  text = path.read
  header = text.match(/\A---\r?\n(.*?)\r?\n---(?:\r?\n|\z)/m)
  unless header
    errors << "#{relative}: missing YAML frontmatter"
    next
  end

  begin
    data = YAML.safe_load(header[1])
    unless data.is_a?(Hash)
      errors << "#{relative}: frontmatter must be a mapping"
      next
    end
    name = data['name']
    description = data['description']
    unless name.is_a?(String) && name.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/) && name.length <= 64
      errors << "#{relative}: invalid skill name"
    end
    errors << "#{relative}: name must match directory" unless name == path.dirname.basename.to_s
    errors << "#{relative}: duplicate skill name #{name}" if names.key?(name)
    names[name] = file
    unless description.is_a?(String) && !description.strip.empty? && description.length <= 1024 && !description.match?(/[<>]/)
      errors << "#{relative}: invalid description"
    end
    if data.key?('disable-model-invocation') && ![true, false].include?(data['disable-model-invocation'])
      errors << "#{relative}: disable-model-invocation must be boolean"
    end
  rescue Psych::Exception => e
    errors << "#{relative}: #{e.message}"
  end
end

documents = Dir[root.join('skills/**/*.md').to_s].sort
documents << root.join('README.md').to_s if root.join('README.md').file?
link_count = 0
documents.each do |file|
  path = Pathname.new(file)
  relative = path.relative_path_from(root)
  fence = nil
  path.each_line.with_index(1) do |line, number|
    marker = line.match(/^\s*(`{3,}|~{3,})/)
    if marker
      token = marker[1]
      if fence.nil?
        fence = token
      elsif token[0] == fence[0] && token.length >= fence.length
        fence = nil
      end
      next
    end
    next if fence
    errors << "#{relative}:#{number}: unfinished TODO" if line.match?(/^\s*\[TODO:/)
    line.scan(/\[[^\]]*\]\(([^)]+)\)/).flatten.each do |raw|
      target = raw.strip.sub(/\A<(.+)>\z/, '\\1')
      next if target.start_with?('#') || target.match?(/\A[a-z][a-z0-9+.-]*:/i)
      target = URI::DEFAULT_PARSER.unescape(target.split('#', 2).first)
      link_count += 1
      errors << "#{relative}:#{number}: missing link target #{target}" unless path.dirname.join(target).exist?
    end
  end
end

Dir[root.join('{plugin.json,.claude-plugin/*.json}').to_s].sort.each do |file|
  begin
    JSON.parse(File.read(file))
  rescue JSON::ParserError => e
    errors << "#{Pathname.new(file).relative_path_from(root)}: #{e.message}"
  end
end

unless errors.empty?
  warn errors.join("\n")
  exit 1
end
puts "Validated #{skills.length} skills, #{documents.length} Markdown files, and #{link_count} local links; plugin JSON parses."
