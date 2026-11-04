Pod::Spec.new do |s|
  s.name           = 'StoryVision'
  s.version        = '1.0.0'
  s.summary        = 'Subject detection for StoryStitch, using Apple Vision on the device.'
  s.description    = 'Finds faces, people and pets in a photo, so crops keep them in frame.'
  s.author         = 'StoryStitch'
  s.homepage       = 'https://storystitch.ashishnag.com'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
